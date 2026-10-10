<?php

namespace App\Services\Backup;

use Illuminate\Database\Connection;
use Illuminate\Support\Facades\DB;
use PDO;
use RuntimeException;

/**
 * Full logical dump of the application database into one gzip SQL file,
 * written in pure PHP (the app container has no mysqldump binary).
 *
 * MySQL / MariaDB: tables (DROP + CREATE + extended INSERTs), views and
 * triggers inside one consistent snapshot; rows are streamed unbuffered and
 * written through gzwrite, so memory stays flat for big tables. Binary
 * columns are exported as hex literals and generated columns are skipped.
 * SQLite (tests, local dev): tables, indexes, views and triggers from
 * sqlite_master with quoted INSERTs.
 */
class DatabaseDumper
{
    /** Largest extended INSERT statement written, in bytes. */
    private const STATEMENT_BYTES = 1_000_000;

    private const BINARY_TYPES = ['binary', 'varbinary', 'tinyblob', 'blob', 'mediumblob', 'longblob', 'bit', 'geometry', 'point', 'linestring', 'polygon', 'multipoint', 'multilinestring', 'multipolygon', 'geometrycollection'];

    /** @var resource|null */
    private $gz = null;

    public function __construct(private ?string $connectionName = null) {}

    /**
     * Dump the whole database to `$path` (gzip). Returns what was written.
     *
     * @return array{driver: string, tables: int, views: int, triggers: int, rows: int}
     */
    public function dump(string $path): array
    {
        $connection = DB::connection($this->connectionName);
        $driver = $connection->getDriverName();

        $gz = gzopen($path, 'wb6');
        if ($gz === false) {
            throw new RuntimeException("Cannot open {$path} for writing.");
        }
        $this->gz = $gz;

        try {
            $summary = match ($driver) {
                'mysql', 'mariadb' => $this->dumpMySql($connection),
                'sqlite' => $this->dumpSqlite($connection),
                default => throw new RuntimeException("Database driver [{$driver}] is not supported for backups."),
            };
        } finally {
            gzclose($gz);
            $this->gz = null;
        }

        return ['driver' => $driver, ...$summary];
    }

    /** @return array{tables: int, views: int, triggers: int, rows: int} */
    private function dumpMySql(Connection $connection): array
    {
        $pdo = $connection->getPdo();
        $database = (string) $connection->getDatabaseName();
        $previousZone = (string) $pdo->query('SELECT @@session.time_zone')->fetchColumn();
        $pdo->exec("SET SESSION time_zone = '+00:00'");
        $pdo->exec('SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ');
        $pdo->exec('START TRANSACTION WITH CONSISTENT SNAPSHOT');

        $tables = 0;
        $views = 0;
        $triggers = 0;
        $rows = 0;

        try {
            $version = (string) $pdo->query('SELECT VERSION()')->fetchColumn();
            $this->write("-- EduFunHub full database backup\n-- Server: {$version}\n-- Database: {$database}\n-- Created: ".now()->toIso8601String()."\n\n");
            $this->write("/*!40101 SET NAMES utf8mb4 */;\nSET time_zone = '+00:00';\nSET FOREIGN_KEY_CHECKS = 0;\nSET UNIQUE_CHECKS = 0;\nSET SQL_MODE = 'NO_AUTO_VALUE_ON_ZERO';\nSET AUTOCOMMIT = 0;\n\n");

            $objects = $pdo->query('SHOW FULL TABLES')->fetchAll(PDO::FETCH_NUM);
            $viewNames = [];
            foreach ($objects as [$name, $type]) {
                if ($type === 'VIEW') {
                    $viewNames[] = $name;

                    continue;
                }
                $create = $pdo->query('SHOW CREATE TABLE '.$this->mysqlName($name))->fetch(PDO::FETCH_NUM);
                $this->write("--\n-- Table ".$this->mysqlName($name)."\n--\nDROP TABLE IF EXISTS ".$this->mysqlName($name).";\n".$create[1].";\n\n");
                $rows += $this->dumpMySqlRows($pdo, $database, $name);
                $tables++;
            }

            foreach ($viewNames as $name) {
                $create = $pdo->query('SHOW CREATE VIEW '.$this->mysqlName($name))->fetch(PDO::FETCH_NUM);
                $definition = (string) preg_replace('/\sDEFINER=`[^`]*`@`[^`]*`/', '', $create[1]);
                $this->write("--\n-- View ".$this->mysqlName($name)."\n--\nDROP TABLE IF EXISTS ".$this->mysqlName($name).";\nDROP VIEW IF EXISTS ".$this->mysqlName($name).";\n{$definition};\n\n");
                $views++;
            }

            foreach ($pdo->query('SHOW TRIGGERS')->fetchAll(PDO::FETCH_NUM) as $trigger) {
                $create = $pdo->query('SHOW CREATE TRIGGER '.$this->mysqlName($trigger[0]))->fetch(PDO::FETCH_NUM);
                $definition = (string) preg_replace('/\sDEFINER=`[^`]*`@`[^`]*`/', '', $create[2]);
                $this->write('DROP TRIGGER IF EXISTS '.$this->mysqlName($trigger[0]).";\nDELIMITER ;;\n{$definition};;\nDELIMITER ;\n\n");
                $triggers++;
            }

            $this->write("COMMIT;\nSET FOREIGN_KEY_CHECKS = 1;\nSET UNIQUE_CHECKS = 1;\n-- Dump completed\n");
        } finally {
            $pdo->exec('COMMIT');
            $pdo->exec('SET SESSION time_zone = '.$pdo->quote($previousZone));
        }

        return compact('tables', 'views', 'triggers', 'rows');
    }

    private function dumpMySqlRows(PDO $pdo, string $database, string $table): int
    {
        $statement = $pdo->prepare('SELECT COLUMN_NAME, DATA_TYPE, EXTRA FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION');
        $statement->execute([$database, $table]);
        $columns = [];
        $select = [];
        foreach ($statement->fetchAll(PDO::FETCH_ASSOC) as $column) {
            if (stripos((string) $column['EXTRA'], 'GENERATED') !== false) {
                continue;
            }
            $quoted = $this->mysqlName((string) $column['COLUMN_NAME']);
            $binary = in_array(strtolower((string) $column['DATA_TYPE']), self::BINARY_TYPES, true);
            $columns[] = ['name' => $quoted, 'binary' => $binary];
            $select[] = $binary ? "HEX({$quoted})" : $quoted;
        }
        if ($columns === []) {
            return 0;
        }

        $prefix = 'INSERT INTO '.$this->mysqlName($table).' ('.implode(', ', array_column($columns, 'name')).') VALUES ';
        $buffered = $pdo->getAttribute(PDO::MYSQL_ATTR_USE_BUFFERED_QUERY);
        $pdo->setAttribute(PDO::MYSQL_ATTR_USE_BUFFERED_QUERY, false);

        try {
            $result = $pdo->query('SELECT '.implode(', ', $select).' FROM '.$this->mysqlName($table));

            return $this->writeInserts($result, $prefix, fn (array $row): string => $this->mysqlRow($pdo, $row, $columns));
        } finally {
            $pdo->setAttribute(PDO::MYSQL_ATTR_USE_BUFFERED_QUERY, $buffered);
        }
    }

    /**
     * @param  list<mixed>  $row
     * @param  list<array{name: string, binary: bool}>  $columns
     */
    private function mysqlRow(PDO $pdo, array $row, array $columns): string
    {
        $values = [];
        foreach ($row as $index => $value) {
            $values[] = match (true) {
                $value === null => 'NULL',
                $columns[$index]['binary'] => $value === '' ? "''" : '0x'.$value,
                is_int($value) => (string) $value,
                is_bool($value) => $value ? '1' : '0',
                default => $pdo->quote((string) $value),
            };
        }

        return '('.implode(',', $values).')';
    }

    /** @return array{tables: int, views: int, triggers: int, rows: int} */
    private function dumpSqlite(Connection $connection): array
    {
        $pdo = $connection->getPdo();
        $this->write("-- EduFunHub full database backup (SQLite)\n-- Created: ".now()->toIso8601String()."\n\nPRAGMA foreign_keys = OFF;\nBEGIN TRANSACTION;\n\n");

        $objects = $pdo->query("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 WHEN 'view' THEN 2 ELSE 3 END, name")->fetchAll(PDO::FETCH_ASSOC);
        $tables = 0;
        $views = 0;
        $triggers = 0;
        $rows = 0;

        foreach ($objects as $object) {
            $name = '"'.str_replace('"', '""', (string) $object['name']).'"';
            if ($object['type'] === 'table') {
                $this->write("DROP TABLE IF EXISTS {$name};\n{$object['sql']};\n");
                $result = $pdo->query("SELECT * FROM {$name}");
                $rows += $this->writeInserts($result, "INSERT INTO {$name} VALUES ", fn (array $row): string => '('.implode(',', array_map(
                    fn (mixed $value): string => match (true) {
                        $value === null => 'NULL',
                        is_int($value), is_float($value) => (string) $value,
                        default => $pdo->quote((string) $value),
                    },
                    $row,
                )).')');
                $this->write("\n");
                $tables++;
            } elseif ($object['type'] === 'view') {
                $this->write("DROP VIEW IF EXISTS {$name};\n{$object['sql']};\n\n");
                $views++;
            } else {
                $this->write("{$object['sql']};\n");
                $triggers += $object['type'] === 'trigger' ? 1 : 0;
            }
        }

        $this->write("COMMIT;\nPRAGMA foreign_keys = ON;\n-- Dump completed\n");

        return compact('tables', 'views', 'triggers', 'rows');
    }

    /**
     * Stream rows from a cursor into extended INSERT statements.
     *
     * @param  \Closure(list<mixed>): string  $formatRow
     */
    private function writeInserts(\PDOStatement $result, string $prefix, \Closure $formatRow): int
    {
        $count = 0;
        $chunk = '';
        while (($row = $result->fetch(PDO::FETCH_NUM)) !== false) {
            $values = $formatRow($row);
            if ($chunk !== '' && strlen($chunk) + strlen($values) > self::STATEMENT_BYTES) {
                $this->write($prefix.$chunk.";\n");
                $chunk = '';
            }
            $chunk .= ($chunk === '' ? '' : ",\n").$values;
            $count++;
        }
        $result->closeCursor();
        if ($chunk !== '') {
            $this->write($prefix.$chunk.";\n");
        }

        return $count;
    }

    private function mysqlName(string $name): string
    {
        return '`'.str_replace('`', '``', $name).'`';
    }

    private function write(string $sql): void
    {
        if ($this->gz === null || gzwrite($this->gz, $sql) === false) {
            throw new RuntimeException('Writing the backup file failed (disk full?).');
        }
    }
}
