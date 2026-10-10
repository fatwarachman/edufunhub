<?php

/**
 * Built-in TKJ (Teknik Komputer dan Jaringan) questions with a visual:
 * UTP and fibre cables, network topologies and console output. Loaded by
 * the 2026_11_02_090002 migration into the question bank (subject `tkj`).
 *
 * Wire colours mirror database/data/sequence_sets.php (Order Rush).
 *
 * @return list<array{key: string, level: int, prompt: array{id: string, en: string}, options: list<array{id: string, en: string}>, answer: int, hint: array{id: string, en: string}, visual: array<string, mixed>}>
 */
$orange = '#f97316';
$green = '#16a34a';
$blue = '#2563eb';
$brown = '#7c4a1e';
$white = '#f8fafc';

$t568b = [
    ['color' => $white, 'stripe' => $orange], ['color' => $orange], ['color' => $white, 'stripe' => $green], ['color' => $blue],
    ['color' => $white, 'stripe' => $blue], ['color' => $green], ['color' => $white, 'stripe' => $brown], ['color' => $brown],
];
$t568a = [
    ['color' => $white, 'stripe' => $green], ['color' => $green], ['color' => $white, 'stripe' => $orange], ['color' => $blue],
    ['color' => $white, 'stripe' => $blue], ['color' => $orange], ['color' => $white, 'stripe' => $brown], ['color' => $brown],
];

$cmd = ['id' => 'Command Prompt', 'en' => 'Command Prompt'];
$t = fn (string $id, string $en): array => ['id' => $id, 'en' => $en];

return [
    [
        'key' => 'tkj-v-utp-b',
        'level' => 1,
        'prompt' => $t('Susunan warna kabel UTP pada gambar (pin 1 di kiri) mengikuti standar…', 'The UTP wire order in the picture (pin 1 on the left) follows which standard?'),
        'options' => [$t('T568B', 'T568B'), $t('T568A', 'T568A'), $t('TIA-598', 'TIA-598'), $t('IEEE 802.11', 'IEEE 802.11')],
        'answer' => 0,
        'hint' => $t('T568B diawali Putih-Orange, Orange.', 'T568B starts with White-Orange, Orange.'),
        'visual' => ['kind' => 'cable', 'style' => 'utp', 'wires' => $t568b, 'caption' => $t('Konektor RJ-45, pin 1–8', 'RJ-45 connector, pins 1–8')],
    ],
    [
        'key' => 'tkj-v-utp-a',
        'level' => 1,
        'prompt' => $t('Susunan warna kabel UTP pada gambar (pin 1 di kiri) mengikuti standar…', 'The UTP wire order in the picture (pin 1 on the left) follows which standard?'),
        'options' => [$t('T568A', 'T568A'), $t('T568B', 'T568B'), $t('Rollover', 'Rollover'), $t('TIA-598', 'TIA-598')],
        'answer' => 0,
        'hint' => $t('T568A diawali Putih-Hijau, Hijau.', 'T568A starts with White-Green, Green.'),
        'visual' => ['kind' => 'cable', 'style' => 'utp', 'wires' => $t568a, 'caption' => $t('Konektor RJ-45, pin 1–8', 'RJ-45 connector, pins 1–8')],
    ],
    [
        'key' => 'tkj-v-utp-cross',
        'level' => 2,
        'prompt' => $t('Ujung pertama kabel memakai T568B, ujung kedua seperti gambar. Jenis kabel ini adalah…', 'One end of the cable uses T568B and the other end looks like the picture. This cable is a…'),
        'options' => [$t('Cross-over', 'Crossover'), $t('Straight-through', 'Straight-through'), $t('Rollover (console)', 'Rollover (console)'), $t('Fiber optic', 'Fibre optic')],
        'answer' => 0,
        'hint' => $t('T568B di satu ujung dan T568A di ujung lain = cross-over.', 'T568B on one end and T568A on the other = crossover.'),
        'visual' => ['kind' => 'cable', 'style' => 'utp', 'wires' => $t568a, 'caption' => $t('Ujung kedua (pin 1–8)', 'Second end (pins 1–8)')],
    ],
    [
        'key' => 'tkj-v-utp-pin3',
        'level' => 1,
        'prompt' => $t('Pada susunan kabel di gambar, warna pin nomor 3 adalah…', 'In the wiring shown, what colour is pin 3?'),
        'options' => [$t('Putih-Hijau', 'White-Green'), $t('Hijau', 'Green'), $t('Putih-Orange', 'White-Orange'), $t('Biru', 'Blue')],
        'answer' => 0,
        'hint' => $t('Pin 3 pada T568B adalah Putih-Hijau.', 'Pin 3 in T568B is White-Green.'),
        'visual' => ['kind' => 'cable', 'style' => 'utp', 'wires' => $t568b, 'caption' => $t('T568B', 'T568B')],
    ],
    [
        'key' => 'tkj-v-fiber-next',
        'level' => 2,
        'prompt' => $t('Gambar menunjukkan core fiber 1–3 standar TIA-598. Warna core nomor 4 adalah…', 'The picture shows fibre cores 1–3 of TIA-598. What colour is core 4?'),
        'options' => [$t('Cokelat', 'Brown'), $t('Abu-abu', 'Slate'), $t('Merah', 'Red'), $t('Kuning', 'Yellow')],
        'answer' => 0,
        'hint' => $t('Biru, Orange, Hijau, Cokelat, Abu-abu, Putih, …', 'Blue, Orange, Green, Brown, Slate, White, …'),
        'visual' => ['kind' => 'cable', 'style' => 'fiber', 'wires' => [['color' => $blue], ['color' => $orange], ['color' => $green]], 'caption' => $t('Core 1–3', 'Cores 1–3')],
    ],
    [
        'key' => 'tkj-v-topo-star',
        'level' => 1,
        'prompt' => $t('Topologi jaringan pada gambar adalah…', 'Which network topology is shown?'),
        'options' => [$t('Star', 'Star'), $t('Bus', 'Bus'), $t('Ring', 'Ring'), $t('Mesh', 'Mesh')],
        'answer' => 0,
        'hint' => $t('Semua komputer terhubung ke satu switch/hub pusat.', 'Every computer connects to one central switch or hub.'),
        'visual' => ['kind' => 'topology', 'shape' => 'star'],
    ],
    [
        'key' => 'tkj-v-topo-bus',
        'level' => 1,
        'prompt' => $t('Topologi jaringan pada gambar adalah…', 'Which network topology is shown?'),
        'options' => [$t('Bus', 'Bus'), $t('Star', 'Star'), $t('Tree', 'Tree'), $t('Ring', 'Ring')],
        'answer' => 0,
        'hint' => $t('Semua perangkat berbagi satu kabel utama (backbone).', 'All devices share one main cable (backbone).'),
        'visual' => ['kind' => 'topology', 'shape' => 'bus'],
    ],
    [
        'key' => 'tkj-v-topo-ring',
        'level' => 1,
        'prompt' => $t('Topologi jaringan pada gambar adalah…', 'Which network topology is shown?'),
        'options' => [$t('Ring', 'Ring'), $t('Mesh', 'Mesh'), $t('Star', 'Star'), $t('Bus', 'Bus')],
        'answer' => 0,
        'hint' => $t('Setiap perangkat terhubung ke dua tetangganya membentuk lingkaran.', 'Each device links to its two neighbours, forming a circle.'),
        'visual' => ['kind' => 'topology', 'shape' => 'ring'],
    ],
    [
        'key' => 'tkj-v-topo-mesh',
        'level' => 2,
        'prompt' => $t('Topologi jaringan pada gambar adalah…', 'Which network topology is shown?'),
        'options' => [$t('Mesh', 'Mesh'), $t('Ring', 'Ring'), $t('Star', 'Star'), $t('Tree', 'Tree')],
        'answer' => 0,
        'hint' => $t('Setiap perangkat terhubung langsung ke semua perangkat lain.', 'Every device links directly to every other device.'),
        'visual' => ['kind' => 'topology', 'shape' => 'mesh'],
    ],
    [
        'key' => 'tkj-v-topo-tree',
        'level' => 2,
        'prompt' => $t('Topologi jaringan bertingkat pada gambar adalah…', 'Which layered network topology is shown?'),
        'options' => [$t('Tree', 'Tree'), $t('Bus', 'Bus'), $t('Mesh', 'Mesh'), $t('Ring', 'Ring')],
        'answer' => 0,
        'hint' => $t('Gabungan beberapa star yang tersusun bertingkat (hierarki).', 'Several stars arranged in a hierarchy.'),
        'visual' => ['kind' => 'topology', 'shape' => 'tree'],
    ],
    [
        'key' => 'tkj-v-topo-star-fail',
        'level' => 2,
        'prompt' => $t('Pada topologi di gambar, apa yang terjadi jika perangkat pusat (switch) mati?', 'In the topology shown, what happens if the central device (switch) fails?'),
        'options' => [$t('Seluruh komputer tidak bisa saling terhubung', 'No computer can reach another'), $t('Hanya satu komputer yang terputus', 'Only one computer is cut off'), $t('Jaringan tetap normal', 'The network keeps working'), $t('Kecepatan jaringan bertambah', 'The network gets faster')],
        'answer' => 0,
        'hint' => $t('Switch pusat adalah titik kegagalan tunggal pada topologi star.', 'The central switch is the single point of failure of a star.'),
        'visual' => ['kind' => 'topology', 'shape' => 'star'],
    ],
    [
        'key' => 'tkj-v-ping-timeout',
        'level' => 1,
        'prompt' => $t('Arti hasil perintah pada layar adalah…', 'What does the command output on screen mean?'),
        'options' => [$t('Host tujuan tidak membalas (tidak terhubung)', 'The target host does not reply (no connection)'), $t('Koneksi ke host tujuan berhasil', 'The connection to the host succeeded'), $t('Alamat IP berhasil diganti', 'The IP address was changed'), $t('DNS berhasil diterjemahkan', 'DNS was resolved')],
        'answer' => 0,
        'hint' => $t('"Request timed out" berarti tidak ada balasan ICMP.', '"Request timed out" means no ICMP reply came back.'),
        'visual' => ['kind' => 'terminal', 'lines' => ['C:\\> ping 192.168.1.1', '', 'Request timed out.', 'Request timed out.', 'Request timed out.', 'Request timed out.', '', 'Packets: Sent = 4, Received = 0, Lost = 4 (100% loss)'], 'caption' => $cmd],
    ],
    [
        'key' => 'tkj-v-ipconfig-network',
        'level' => 2,
        'prompt' => $t('Berdasarkan hasil ipconfig pada layar, alamat network komputer tersebut adalah…', 'Based on the ipconfig output on screen, what is the network address?'),
        'options' => [$t('192.168.10.0', '192.168.10.0'), $t('192.168.10.1', '192.168.10.1'), $t('192.168.10.255', '192.168.10.255'), $t('192.168.0.0', '192.168.0.0')],
        'answer' => 0,
        'hint' => $t('Mask 255.255.255.0: oktet terakhir network bernilai 0.', 'Mask 255.255.255.0: the last octet of the network is 0.'),
        'visual' => ['kind' => 'terminal', 'lines' => ['C:\\> ipconfig', '', 'Ethernet adapter Ethernet:', '   IPv4 Address. . . . : 192.168.10.25', '   Subnet Mask . . . . : 255.255.255.0', '   Default Gateway . . : 192.168.10.1'], 'caption' => $cmd],
    ],
    [
        'key' => 'tkj-v-ipconfig-cidr',
        'level' => 1,
        'prompt' => $t('Penulisan prefix (CIDR) untuk subnet mask pada layar adalah…', 'What is the prefix (CIDR) of the subnet mask on screen?'),
        'options' => [$t('/24', '/24'), $t('/16', '/16'), $t('/8', '/8'), $t('/30', '/30')],
        'answer' => 0,
        'hint' => $t('255.255.255.0 = 24 bit bernilai 1.', '255.255.255.0 = 24 one-bits.'),
        'visual' => ['kind' => 'terminal', 'lines' => ['C:\\> ipconfig', '', '   IPv4 Address. . . . : 172.16.5.40', '   Subnet Mask . . . . : 255.255.255.0'], 'caption' => $cmd],
    ],
    [
        'key' => 'tkj-v-linux-hosts',
        'level' => 3,
        'prompt' => $t('Berapa jumlah host valid pada subnet interface di layar?', 'How many usable hosts does the interface subnet on screen have?'),
        'options' => [$t('30', '30'), $t('32', '32'), $t('62', '62'), $t('14', '14')],
        'answer' => 0,
        'hint' => $t('/27 menyisakan 5 bit host: 2⁵ − 2 = 30.', '/27 leaves 5 host bits: 2⁵ − 2 = 30.'),
        'visual' => ['kind' => 'terminal', 'lines' => ['$ ip addr show eth0', '2: eth0: <BROADCAST,MULTICAST,UP> mtu 1500', '    inet 10.0.0.5/27 brd 10.0.0.31 scope global eth0'], 'caption' => $t('Terminal Linux', 'Linux terminal')],
    ],
    [
        'key' => 'tkj-v-mikrotik-address',
        'level' => 2,
        'prompt' => $t('Perintah MikroTik pada layar berfungsi untuk…', 'What does the MikroTik command on screen do?'),
        'options' => [$t('Memberi alamat IP pada interface ether2', 'Assign an IP address to interface ether2'), $t('Membuat DHCP server di ether2', 'Create a DHCP server on ether2'), $t('Menghapus alamat IP ether2', 'Remove the IP address of ether2'), $t('Membuat rule firewall', 'Create a firewall rule')],
        'answer' => 0,
        'hint' => $t('/ip address add = menambah alamat IP pada interface.', '/ip address add = add an IP address to an interface.'),
        'visual' => ['kind' => 'terminal', 'lines' => ['[admin@MikroTik] > /ip address add address=192.168.88.1/24 interface=ether2', '[admin@MikroTik] > /ip address print', ' #   ADDRESS            NETWORK         INTERFACE', ' 0   192.168.88.1/24    192.168.88.0    ether2'], 'caption' => $t('Terminal MikroTik', 'MikroTik terminal')],
    ],
    [
        'key' => 'tkj-v-tracert',
        'level' => 2,
        'prompt' => $t('Perintah pada layar digunakan untuk…', 'What is the command on screen used for?'),
        'options' => [$t('Melihat jalur (hop) yang dilalui paket ke tujuan', 'Show the path (hops) packets take to the target'), $t('Melihat alamat MAC komputer', 'Show the computer MAC address'), $t('Mengganti DNS server', 'Change the DNS server'), $t('Menguji kecepatan download', 'Test download speed')],
        'answer' => 0,
        'hint' => $t('tracert menampilkan setiap router (hop) di sepanjang jalur.', 'tracert lists each router (hop) along the path.'),
        'visual' => ['kind' => 'terminal', 'lines' => ['C:\\> tracert 8.8.8.8', '', '  1    1 ms    1 ms    1 ms  192.168.1.1', '  2    8 ms    7 ms    9 ms  10.20.0.1', '  3   15 ms   14 ms   15 ms  103.20.1.9', '  4   21 ms   20 ms   22 ms  8.8.8.8', '', 'Trace complete.'], 'caption' => $cmd],
    ],
    [
        'key' => 'tkj-v-nslookup',
        'level' => 1,
        'prompt' => $t('Layanan jaringan yang menerjemahkan nama domain menjadi alamat IP seperti pada layar adalah…', 'Which network service turns a domain name into an IP address, as on screen?'),
        'options' => [$t('DNS', 'DNS'), $t('DHCP', 'DHCP'), $t('FTP', 'FTP'), $t('SMTP', 'SMTP')],
        'answer' => 0,
        'hint' => $t('DNS = Domain Name System.', 'DNS = Domain Name System.'),
        'visual' => ['kind' => 'terminal', 'lines' => ['C:\\> nslookup edufunhub.com', 'Server:  dns.google', 'Address: 8.8.8.8', '', 'Name:    edufunhub.com', 'Address: 104.21.3.10'], 'caption' => $cmd],
    ],
];
