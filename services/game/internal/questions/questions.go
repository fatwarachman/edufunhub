// Package questions provides grade-appropriate bilingual questions.
package questions

import (
	"encoding/json"
	"fmt"
	"math/rand/v2"
	"strings"

	"edufunhub/game/internal/points"
)

// Text is a bilingual string (Indonesian default, English translation).
type Text struct {
	ID string `json:"id"`
	EN string `json:"en"`
	// Media is an optional answer option picture (bank options only).
	Media *OptionMedia `json:"media,omitempty"`
}

// OptionMedia is a picture attached to one answer option.
type OptionMedia struct {
	Kind string `json:"kind"`
	Src  string `json:"src"`
}

// Get returns the text for a locale, defaulting to Indonesian.
func (t Text) Get(locale string) string {
	if locale == "en" && t.EN != "" {
		return t.EN
	}
	return t.ID
}

func same(s string) Text { return Text{ID: s, EN: s} }

// Question is a multiple choice question. For true/false questions Options is empty and Answer is 1 (true) or 0 (false).
type Question struct {
	Key     string
	Subject string
	Prompt  Text
	Options []Text
	Answer  int
	Hint    Text
	// FromBank is true for curated bank questions (tracked in admin statistics), false for generated math.
	FromBank bool
	// Points is what a correct answer earns (admin bonus questions are worth
	// more; 0 means the standard per-correct value).
	Points int
	// Level is the difficulty (1 easy, 2 medium, 3 expert); it multiplies
	// the points of a correct answer.
	Level int
	// Order maps each displayed option index to its index in the original
	// bank item (filled by shuffle and Trim; nil means identity).
	Order []int
	// Visual is the bank item's illustration (nil when none); games send it
	// to clients as the question's "media".
	Visual json.RawMessage
	// Shown is set on a true/false question made from a multiple choice bank
	// item: the original option index shown as "Answer: ...". A pick is then
	// recorded against that option (see TruthPick), never as 0/1.
	Shown *int
}

// Media returns the illustration for a client message (nil when none).
func (q Question) Media() json.RawMessage {
	if len(q.Visual) == 0 || string(q.Visual) == "null" {
		return nil
	}
	return q.Visual
}

// OptionMedia returns the option pictures aligned with Options, or nil when
// no option has one (clients then render text-only options).
func (q Question) OptionMedia() []*OptionMedia {
	var out []*OptionMedia
	for i, o := range q.Options {
		if o.Media == nil || o.Media.Src == "" {
			continue
		}
		if out == nil {
			out = make([]*OptionMedia, len(q.Options))
		}
		out[i] = o.Media
	}
	return out
}

// Original returns the original bank option index of the displayed option
// the player picked, or nil when it cannot be attributed (generated math,
// out of range).
func (q Question) Original(displayed int) *int {
	if !q.FromBank || displayed < 0 || displayed >= len(q.Options) {
		return nil
	}
	i := displayed
	if displayed < len(q.Order) {
		i = q.Order[displayed]
	}
	return &i
}

// Picked is Original for an answered round; nil when the player did not answer.
func (q Question) Picked(answered bool, displayed int) *int {
	if !answered {
		return nil
	}
	return q.Original(displayed)
}

// TruthPick is the recorded choice of a true/false pick: 0/1 for bank
// true/false items; for one made from a multiple choice item, "true" picks
// the shown option and "false" cannot be attributed to an option (nil).
func (q Question) TruthPick(value bool) *int {
	if !q.FromBank {
		return nil
	}
	if q.Shown != nil {
		if !value {
			return nil
		}
		shown := *q.Shown
		return &shown
	}
	return TruthChoice(value)
}

// TruthChoice returns the original option index of a true/false pick
// (0 = false, 1 = true), matching the bank's answer encoding.
func TruthChoice(value bool) *int {
	i := 0
	if value {
		i = 1
	}
	return &i
}

// Worth returns the portal points of a correct answer to q: its base value
// times its level (easy x1, medium x2, expert x3).
func (q Question) Worth() int { return points.Worth(q.Points, q.Level) }

// Band maps a school grade (0 = kindergarten, 1-12) to a band index 0..3.
func Band(grade int) int {
	switch {
	case grade <= 3:
		return 0
	case grade <= 6:
		return 1
	case grade <= 9:
		return 2
	default:
		return 3
	}
}

type mc struct {
	subject string
	prompt  Text
	options []Text
	answer  int
	hint    Text
}

func opts(values ...string) []Text {
	out := make([]Text, len(values))
	for i, v := range values {
		out[i] = same(v)
	}
	return out
}

func bi(pairs ...string) []Text {
	out := make([]Text, 0, len(pairs)/2)
	for i := 0; i+1 < len(pairs); i += 2 {
		out = append(out, Text{ID: pairs[i], EN: pairs[i+1]})
	}
	return out
}

var choiceBank = [4][]mc{
	{ // Grade 1-3
		{"science", Text{ID: "Hewan yang hidup di air dan bernapas dengan insang adalah…", EN: "An animal that lives in water and breathes with gills is a…"}, bi("Ikan", "Fish", "Kucing", "Cat", "Ayam", "Chicken", "Kambing", "Goat"), 0, Text{ID: "Insang ada pada ikan.", EN: "Fish have gills."}},
		{"science", Text{ID: "Matahari terbit dari arah…", EN: "The sun rises in the…"}, bi("Timur", "East", "Barat", "West", "Utara", "North", "Selatan", "South"), 0, Text{ID: "Matahari terbit di timur.", EN: "The sun rises in the east."}},
		{"science", Text{ID: "Tumbuhan membutuhkan … untuk tumbuh.", EN: "Plants need … to grow."}, bi("Air dan cahaya", "Water and light", "Pasir saja", "Only sand", "Plastik", "Plastic", "Gelap", "Darkness"), 0, Text{ID: "Tumbuhan butuh air dan cahaya matahari.", EN: "Plants need water and sunlight."}},
		{"language", Text{ID: "Lawan kata \"besar\" adalah…", EN: "The opposite of \"big\" is…"}, bi("Kecil", "Small", "Tinggi", "Tall", "Luas", "Wide", "Berat", "Heavy"), 0, Text{ID: "Besar lawan katanya kecil.", EN: "Big is the opposite of small."}},
		{"language", Text{ID: "Huruf vokal adalah…", EN: "Which one is a vowel?"}, opts("A", "B", "K", "T"), 0, Text{ID: "Vokal: A, I, U, E, O.", EN: "Vowels: A, E, I, O, U."}},
		{"social", Text{ID: "Warna bendera Indonesia adalah…", EN: "The colours of Indonesia's flag are…"}, bi("Merah putih", "Red and white", "Biru putih", "Blue and white", "Merah kuning", "Red and yellow", "Hijau putih", "Green and white"), 0, Text{ID: "Sang Saka Merah Putih.", EN: "The Red and White flag."}},
		{"social", Text{ID: "Dalam seminggu ada … hari.", EN: "There are … days in a week."}, opts("7", "5", "6", "10"), 0, Text{ID: "Senin sampai Minggu = 7 hari.", EN: "Monday to Sunday = 7 days."}},
		{"english", Text{ID: "Bahasa Inggris dari \"kucing\" adalah…", EN: "Which word means a small furry pet that says \"meow\"?"}, opts("Cat", "Dog", "Bird", "Fish"), 0, Text{ID: "Kucing = cat.", EN: "A cat says meow."}},
		{"civics", Text{ID: "Sila pertama Pancasila adalah…", EN: "The first principle of Pancasila is…"}, bi("Ketuhanan Yang Maha Esa", "Belief in the One and Only God", "Persatuan Indonesia", "Unity of Indonesia", "Keadilan sosial", "Social justice", "Kerakyatan", "Democracy"), 0, Text{ID: "Sila ke-1: Ketuhanan Yang Maha Esa.", EN: "Principle 1: Belief in the One and Only God."}},
		{"science", Text{ID: "Bagian tubuh untuk melihat adalah…", EN: "The body part we use to see is the…"}, bi("Mata", "Eyes", "Telinga", "Ears", "Hidung", "Nose", "Lidah", "Tongue"), 0, Text{ID: "Kita melihat dengan mata.", EN: "We see with our eyes."}},
	},
	{ // Grade 4-6
		{"science", Text{ID: "Proses tumbuhan membuat makanan sendiri disebut…", EN: "The process by which plants make their own food is called…"}, bi("Fotosintesis", "Photosynthesis", "Respirasi", "Respiration", "Evaporasi", "Evaporation", "Penyerbukan", "Pollination"), 0, Text{ID: "Fotosintesis memakai cahaya matahari.", EN: "Photosynthesis uses sunlight."}},
		{"science", Text{ID: "Planet terdekat dengan Matahari adalah…", EN: "The planet closest to the Sun is…"}, bi("Merkurius", "Mercury", "Venus", "Venus", "Bumi", "Earth", "Mars", "Mars"), 0, Text{ID: "Urutan: Merkurius, Venus, Bumi…", EN: "Order: Mercury, Venus, Earth…"}},
		{"science", Text{ID: "Perubahan wujud air menjadi uap disebut…", EN: "Water changing into vapour is called…"}, bi("Menguap", "Evaporation", "Membeku", "Freezing", "Mencair", "Melting", "Mengembun", "Condensation"), 0, Text{ID: "Cair ke gas = menguap.", EN: "Liquid to gas = evaporation."}},
		{"social", Text{ID: "Ibu kota Provinsi Jawa Barat adalah…", EN: "The capital of West Java province is…"}, opts("Bandung", "Semarang", "Surabaya", "Serang"), 0, Text{ID: "Bandung adalah ibu kota Jawa Barat.", EN: "Bandung is West Java's capital."}},
		{"social", Text{ID: "Proklamasi kemerdekaan Indonesia dibacakan tahun…", EN: "Indonesia's independence was proclaimed in…"}, opts("1945", "1942", "1949", "1950"), 0, Text{ID: "17 Agustus 1945.", EN: "17 August 1945."}},
		{"language", Text{ID: "Kalimat yang menggunakan tanda tanya adalah kalimat…", EN: "A sentence that ends with a question mark is a…"}, bi("Tanya", "Question", "Perintah", "Command", "Berita", "Statement", "Seru", "Exclamation"), 0, Text{ID: "Kalimat tanya diakhiri tanda tanya.", EN: "Questions end with a question mark."}},
		{"english", Text{ID: "\"I … to school every day.\"", EN: "\"I … to school every day.\""}, opts("go", "goes", "going", "went"), 0, Text{ID: "Subjek I memakai go.", EN: "Subject I uses go."}},
		{"civics", Text{ID: "Lambang negara Indonesia adalah…", EN: "Indonesia's national emblem is…"}, bi("Garuda Pancasila", "Garuda Pancasila", "Bintang", "A star", "Banteng", "A bull", "Padi dan kapas", "Rice and cotton"), 0, Text{ID: "Garuda Pancasila.", EN: "Garuda Pancasila."}},
		{"science", Text{ID: "Hewan pemakan tumbuhan disebut…", EN: "Animals that eat only plants are called…"}, bi("Herbivora", "Herbivores", "Karnivora", "Carnivores", "Omnivora", "Omnivores", "Dekomposer", "Decomposers"), 0, Text{ID: "Herbivora makan tumbuhan.", EN: "Herbivores eat plants."}},
		{"social", Text{ID: "Mata uang Indonesia adalah…", EN: "Indonesia's currency is the…"}, opts("Rupiah", "Ringgit", "Baht", "Peso"), 0, Text{ID: "Rupiah (Rp).", EN: "Rupiah (Rp)."}},
	},
	{ // Grade 7-9
		{"science", Text{ID: "Satuan kuat arus listrik dalam SI adalah…", EN: "The SI unit of electric current is the…"}, bi("Ampere", "Ampere", "Volt", "Volt", "Ohm", "Ohm", "Watt", "Watt"), 0, Text{ID: "Arus diukur dalam ampere.", EN: "Current is measured in amperes."}},
		{"science", Text{ID: "Organel tempat fotosintesis adalah…", EN: "The organelle where photosynthesis happens is the…"}, bi("Kloroplas", "Chloroplast", "Mitokondria", "Mitochondrion", "Ribosom", "Ribosome", "Vakuola", "Vacuole"), 0, Text{ID: "Kloroplas mengandung klorofil.", EN: "Chloroplasts contain chlorophyll."}},
		{"science", Text{ID: "Rumus kimia air adalah…", EN: "The chemical formula of water is…"}, opts("H₂O", "CO₂", "O₂", "NaCl"), 0, Text{ID: "Dua hidrogen, satu oksigen.", EN: "Two hydrogens, one oxygen."}},
		{"social", Text{ID: "ASEAN didirikan melalui Deklarasi…", EN: "ASEAN was founded through the … Declaration."}, opts("Bangkok", "Jakarta", "Manila", "Kuala Lumpur"), 0, Text{ID: "Deklarasi Bangkok 1967.", EN: "The 1967 Bangkok Declaration."}},
		{"social", Text{ID: "Garis khayal yang membagi bumi utara dan selatan adalah…", EN: "The imaginary line dividing north and south is the…"}, bi("Khatulistiwa", "Equator", "Meridian", "Meridian", "Garis balik", "Tropic", "Garis bujur", "Longitude"), 0, Text{ID: "Khatulistiwa = lintang 0°.", EN: "The equator is 0° latitude."}},
		{"language", Text{ID: "Teks yang bertujuan meyakinkan pembaca disebut teks…", EN: "A text written to convince readers is a … text."}, bi("Persuasi", "Persuasive", "Narasi", "Narrative", "Deskripsi", "Descriptive", "Prosedur", "Procedure"), 0, Text{ID: "Persuasi = mengajak/meyakinkan.", EN: "Persuasive texts convince."}},
		{"english", Text{ID: "Past tense of \"write\" is…", EN: "The past tense of \"write\" is…"}, opts("wrote", "writed", "written", "writes"), 0, Text{ID: "write – wrote – written.", EN: "write – wrote – written."}},
		{"civics", Text{ID: "Lembaga yang berwenang mengubah UUD 1945 adalah…", EN: "The body authorised to amend the 1945 Constitution is the…"}, opts("MPR", "DPR", "MA", "KPU"), 0, Text{ID: "MPR berwenang mengubah UUD.", EN: "The MPR can amend the constitution."}},
		{"math", Text{ID: "Gradien garis y = 3x + 2 adalah…", EN: "The gradient of y = 3x + 2 is…"}, opts("3", "2", "5", "1/3"), 0, Text{ID: "y = mx + c, m = 3.", EN: "y = mx + c, m = 3."}},
		{"math", Text{ID: "Sudut-sudut segitiga berjumlah…", EN: "The angles of a triangle add up to…"}, opts("180°", "90°", "360°", "270°"), 0, Text{ID: "Jumlah sudut segitiga 180°.", EN: "Triangle angles sum to 180°."}},
	},
	{ // Grade 10-12
		{"science", Text{ID: "Hukum Newton II dirumuskan sebagai…", EN: "Newton's second law is written as…"}, opts("F = m·a", "E = m·c²", "V = I·R", "P = W/t"), 0, Text{ID: "Gaya = massa × percepatan.", EN: "Force = mass × acceleration."}},
		{"science", Text{ID: "Bilangan Avogadro kira-kira…", EN: "Avogadro's number is approximately…"}, opts("6,02 × 10²³", "3,00 × 10⁸", "9,81", "1,6 × 10⁻¹⁹"), 0, Text{ID: "Jumlah partikel per mol.", EN: "Particles per mole."}},
		{"science", Text{ID: "Molekul pembawa informasi genetik adalah…", EN: "The molecule that carries genetic information is…"}, opts("DNA", "ATP", "Glukosa", "Lipid"), 0, Text{ID: "DNA menyimpan kode genetik.", EN: "DNA stores the genetic code."}},
		{"math", Text{ID: "Turunan dari f(x) = x³ adalah…", EN: "The derivative of f(x) = x³ is…"}, opts("3x²", "x²", "3x", "x⁴/4"), 0, Text{ID: "d/dx xⁿ = n·xⁿ⁻¹.", EN: "d/dx xⁿ = n·xⁿ⁻¹."}},
		{"math", Text{ID: "Nilai sin 30° adalah…", EN: "The value of sin 30° is…"}, opts("1/2", "√3/2", "1", "0"), 0, Text{ID: "sin 30° = 0,5.", EN: "sin 30° = 0.5."}},
		{"math", Text{ID: "log₁₀ 1000 = …", EN: "log₁₀ 1000 = …"}, opts("3", "2", "10", "100"), 0, Text{ID: "10³ = 1000.", EN: "10³ = 1000."}},
		{"social", Text{ID: "Konferensi Asia Afrika 1955 diadakan di…", EN: "The 1955 Asian–African Conference was held in…"}, opts("Bandung", "Jakarta", "Yogyakarta", "Bogor"), 0, Text{ID: "KAA di Bandung.", EN: "It took place in Bandung."}},
		{"social", Text{ID: "Inflasi adalah kenaikan … secara umum dan terus-menerus.", EN: "Inflation is a general, continuous rise in…"}, bi("Harga", "Prices", "Upah saja", "Wages only", "Ekspor", "Exports", "Pajak", "Taxes"), 0, Text{ID: "Inflasi = harga naik terus.", EN: "Inflation = rising prices."}},
		{"english", Text{ID: "\"If I … rich, I would travel the world.\"", EN: "\"If I … rich, I would travel the world.\""}, opts("were", "am", "will be", "being"), 0, Text{ID: "Conditional tipe 2 memakai were.", EN: "Second conditional uses were."}},
		{"language", Text{ID: "Majas yang membandingkan secara langsung tanpa kata \"seperti\" adalah…", EN: "A figure of speech comparing directly without \"like\" is a…"}, bi("Metafora", "Metaphor", "Simile", "Simile", "Hiperbola", "Hyperbole", "Personifikasi", "Personification"), 0, Text{ID: "Metafora = perbandingan langsung.", EN: "A metaphor compares directly."}},
	},
}

type tf struct {
	subject string
	prompt  Text
	answer  bool
}

var truthBank = [4][]tf{
	{
		{"science", Text{ID: "Ikan bernapas menggunakan paru-paru.", EN: "Fish breathe with lungs."}, false},
		{"science", Text{ID: "Es akan mencair jika dipanaskan.", EN: "Ice melts when heated."}, true},
		{"social", Text{ID: "Indonesia merdeka pada tanggal 17 Agustus.", EN: "Indonesia became independent on 17 August."}, true},
		{"science", Text{ID: "Bulan memancarkan cahayanya sendiri.", EN: "The Moon makes its own light."}, false},
		{"english", Text{ID: "\"Apple\" dalam bahasa Indonesia berarti apel.", EN: "An apple is a fruit."}, true},
		{"science", Text{ID: "Laba-laba memiliki enam kaki.", EN: "Spiders have six legs."}, false},
	},
	{
		{"science", Text{ID: "Jantung berfungsi memompa darah.", EN: "The heart pumps blood."}, true},
		{"science", Text{ID: "Bumi berputar pada porosnya disebut revolusi.", EN: "Earth spinning on its axis is called revolution."}, false},
		{"social", Text{ID: "Pulau terbesar di Indonesia adalah Pulau Jawa.", EN: "Java is Indonesia's largest island."}, false},
		{"civics", Text{ID: "Pancasila memiliki lima sila.", EN: "Pancasila has five principles."}, true},
		{"science", Text{ID: "Kelelawar termasuk mamalia.", EN: "Bats are mammals."}, true},
		{"english", Text{ID: "\"She go to school\" adalah kalimat yang benar.", EN: "\"She go to school\" is grammatically correct."}, false},
	},
	{
		{"science", Text{ID: "Cahaya merambat lebih cepat daripada bunyi.", EN: "Light travels faster than sound."}, true},
		{"science", Text{ID: "Mitokondria adalah tempat respirasi sel.", EN: "Mitochondria are where cellular respiration happens."}, true},
		{"social", Text{ID: "Indonesia terletak di antara dua benua dan dua samudra.", EN: "Indonesia lies between two continents and two oceans."}, true},
		{"science", Text{ID: "Logam adalah isolator listrik yang baik.", EN: "Metals are good electrical insulators."}, false},
		{"civics", Text{ID: "DPR adalah lembaga yudikatif.", EN: "The DPR is a judicial institution."}, false},
		{"english", Text{ID: "\"Children\" adalah bentuk jamak dari \"child\".", EN: "\"Children\" is the plural of \"child\"."}, true},
	},
	{
		{"science", Text{ID: "Elektron bermuatan positif.", EN: "Electrons carry a positive charge."}, false},
		{"science", Text{ID: "Enzim adalah biokatalisator.", EN: "Enzymes are biological catalysts."}, true},
		{"math", Text{ID: "Bilangan π adalah bilangan rasional.", EN: "π is a rational number."}, false},
		{"social", Text{ID: "Sumpah Pemuda diikrarkan pada tahun 1928.", EN: "The Youth Pledge was declared in 1928."}, true},
		{"science", Text{ID: "Percepatan gravitasi bumi kira-kira 9,8 m/s².", EN: "Earth's gravitational acceleration is about 9.8 m/s²."}, true},
		{"english", Text{ID: "\"Has been\" menandakan present perfect continuous.", EN: "\"Has been + -ing\" forms the present perfect continuous."}, true},
	},
}

// Generator produces questions. Rand is injectable for deterministic tests.
type Generator struct {
	Grade int
	// Game limits bank questions to those distributed to this game ("" = any).
	Game string
	// Subject limits questions to the chosen subjects (one key or several
	// joined by SubjectSeparator); "" (or Mix) mixes every subject.
	Subject string
	// Players whose history steers the order: questions they have not seen
	// (or saw longest ago) come first, so every game starts differently.
	Players []int64
	// Level is the chosen difficulty (1 easy, 2 medium, 3 expert). Bank
	// questions of that level come first; generated arithmetic gets harder.
	Level int
	// Classroom is the teacher classroom whose picked questions replace the
	// bank for this game (0 = none, see InClassroom).
	Classroom int64
	Rand      *rand.Rand
	used      map[string]bool
	fellBack  bool
	// locked is set when a classroom fixed the subjects (InClassroom).
	locked bool
	// shown remembers, per question key, every option arrangement already
	// displayed in this game so a repeated question changes its order.
	shown map[string][]arrangement
}

// arrangement is one displayed option order of a question.
type arrangement struct {
	answer    int
	signature string
}

// New returns a generator for a grade with a seeded source.
func New(grade int, seed uint64) *Generator {
	return NewFor("", grade, seed)
}

// NewFor returns a generator that only draws bank questions distributed to game.
func NewFor(game string, grade int, seed uint64) *Generator {
	return &Generator{Grade: grade, Game: game, Rand: rand.New(rand.NewPCG(seed, seed^0x9e3779b97f4a7c15)), used: map[string]bool{}}
}

// AtLevel sets the difficulty (1 easy, 2 medium, 3 expert).
func (g *Generator) AtLevel(level int) *Generator {
	g.Level = points.Level(level)
	return g
}

func (g *Generator) level() int { return points.Level(g.Level) }

// For narrows the generator to the chosen subjects (one key or several
// joined by SubjectSeparator) and the players at the table.
func (g *Generator) For(subject string, players ...int64) *Generator {
	g.Subject = NormSubject(subject)
	g.Players = players
	return g
}

// mathAllowed reports whether generated arithmetic fits the chosen subjects.
func (g *Generator) mathAllowed() bool {
	return g.Subject == "" || containsString(strings.Split(g.Subject, SubjectSeparator), "math")
}

// items returns the bank items for this generator's grade and subject. The
// game's own pool comes first; when it has nothing for the subject (or for
// the grade at all), the subject's questions distributed to other games and
// then the built-in bank are used, so a chosen subject is never replaced by
// generated arithmetic. Only when no pool has the subject does the game fall
// back to the mix, and Fallback then reports it to the players.
func (g *Generator) items(kind string) []Item {
	items, _ := g.source(kind)
	return items
}

// source returns the items to draw from and whether they are a teacher's
// classroom pool. A classroom pool wins over everything: it is used as is
// (no grade, level or subject filter, no fallback flag).
func (g *Generator) source(kind string) ([]Item, bool) {
	if pool := g.classroomItems(kind); len(pool) > 0 {
		if difficulty, ok := Current().ClassroomDifficulty(g.Classroom, g.Game); ok && difficulty > 0 {
			return g.byLevel(pool), true
		}
		return pool, true
	}
	return g.bankItems(kind), false
}

// bankItems is the normal (non-classroom) bank selection described on items.
func (g *Generator) bankItems(kind string) []Item {
	pools := [][]Item{
		Current().filter(kind, g.Grade, g.Game),
		Current().filter(kind, g.Grade, ""),
		builtin.filter(kind, g.Grade, ""),
	}
	for _, pool := range pools {
		if out := bySubject(pool, g.Subject); len(out) > 0 {
			return g.byLevel(out)
		}
	}
	// A chosen subject (by the player or locked by a classroom) keeps its
	// questions even without any for the player's grade: the nearest grades
	// of those subjects come first. Only a subject without questions at all
	// falls back to the mix (players saw other subjects although they picked
	// one, e.g. a vocational subject chosen by a primary school player).
	if g.locked || g.Subject != "" {
		for _, pool := range [][]Item{
			Current().filter(kind, anyGrade, g.Game),
			Current().filter(kind, anyGrade, ""),
			builtin.filter(kind, anyGrade, ""),
		} {
			if out := bySubject(pool, g.Subject); len(out) > 0 {
				return g.byLevel(g.nearestGrade(out))
			}
		}
	}
	if g.mathAllowed() {
		return nil
	}
	g.fellBack = true
	for _, pool := range pools {
		if len(pool) > 0 {
			return g.byLevel(pool)
		}
	}
	return nil
}

// byLevel keeps the items of the generator's level. When the pool has none
// of that level, the nearest level is used (questions keep their own level,
// so the points always match the question actually asked).
func (g *Generator) byLevel(items []Item) []Item {
	want := g.level()
	for _, dist := range []int{0, 1, 2} {
		out := make([]Item, 0, len(items))
		for _, it := range items {
			if d := points.Level(it.Level) - want; d == dist || d == -dist {
				out = append(out, it)
			}
		}
		if len(out) > 0 {
			return out
		}
	}
	return items
}

// bySubject keeps the items of the chosen subjects (one key or several
// joined by SubjectSeparator; "" keeps every item).
func bySubject(items []Item, subject string) []Item {
	if subject == "" {
		return items
	}
	chosen := strings.Split(subject, SubjectSeparator)
	out := make([]Item, 0, len(items))
	for _, it := range items {
		if containsString(chosen, it.Subject) {
			out = append(out, it)
		}
	}
	return out
}

// Fallback reports whether the chosen subject had no questions for this
// grade and game, so the mix was used instead.
func (g *Generator) Fallback() bool { return g.fellBack }

// pick draws the bank item the players have least recently seen (unseen
// first, ties broken randomly), never repeating within one game. Mixed and
// math games continue with generated arithmetic once the pool is used up;
// any other chosen subject starts its pool again instead of switching to
// math. A classroom pool (pooled) never mixes in arithmetic and always
// starts again once used up.
func (g *Generator) pick(items []Item, pooled bool) (Item, bool) {
	if len(items) == 0 {
		return Item{}, false
	}
	// Mixed play with arithmetic keeps some generated math in the rotation.
	if !pooled && g.mathAllowed() && g.Rand.IntN(4) == 0 {
		return Item{}, false
	}
	exhausted := true
	for _, it := range items {
		exhausted = exhausted && g.used[it.Key]
	}
	if exhausted && (pooled || !g.mathAllowed()) {
		for _, it := range items {
			delete(g.used, it.Key)
		}
	}
	best, bestAge, found := Item{}, int64(0), false
	for _, i := range g.Rand.Perm(len(items)) {
		it := items[i]
		if g.used[it.Key] {
			continue
		}
		age := History.LastSeen(g.Players, it.Key)
		if !found || age < bestAge {
			best, bestAge, found = it, age, true
		}
		if age == 0 {
			break
		}
	}
	if !found {
		return Item{}, false
	}
	g.used[best.Key] = true
	History.Mark(g.Players, best.Key)
	return best, true
}

// BankChoice draws a multiple choice bank question distributed to this
// generator's game, limited to the given subjects (none = any subject). It
// never falls back to generated arithmetic or other subjects, so games with
// their own content mix in admin questions only when they exist.
//
// A classroom pool replaces it entirely (no subject or level filter) and
// starts again once every picked question was asked. Subjects locked by
// the classroom narrow the given subjects.
func (g *Generator) BankChoice(subjects ...string) (Question, bool) {
	if pool := g.classroomItems(TypeChoice); len(pool) > 0 {
		it, ok := g.pick(pool, true)
		if !ok {
			return Question{}, false
		}
		q := Question{Key: it.Key, Subject: it.Subject, Prompt: it.Prompt, Hint: it.Hint, Options: append([]Text(nil), it.Options...), Answer: it.Answer, FromBank: true, Points: it.Points, Level: points.Level(it.Level), Visual: it.Visual}
		g.shuffle(&q)
		return q, true
	}
	if g.locked {
		subjects = lockedSubjects(subjects, SplitSubjects(g.Subject))
		if len(subjects) == 0 {
			return Question{}, false
		}
	}
	all := Current().filter(TypeChoice, g.Grade, g.Game)
	items := make([]Item, 0, len(all))
	for _, it := range all {
		if len(subjects) == 0 || containsString(subjects, it.Subject) {
			items = append(items, it)
		}
	}
	if len(items) > 0 {
		items = g.byLevel(items)
	}
	best, bestAge, found := Item{}, int64(0), false
	for _, i := range g.Rand.Perm(len(items)) {
		it := items[i]
		if g.used[it.Key] {
			continue
		}
		age := History.LastSeen(g.Players, it.Key)
		if !found || age < bestAge {
			best, bestAge, found = it, age, true
		}
		if age == 0 {
			break
		}
	}
	if !found {
		return Question{}, false
	}
	g.used[best.Key] = true
	History.Mark(g.Players, best.Key)
	q := Question{Key: best.Key, Subject: best.Subject, Prompt: best.Prompt, Hint: best.Hint, Options: append([]Text(nil), best.Options...), Answer: best.Answer, FromBank: true, Points: best.Points, Level: points.Level(best.Level), Visual: best.Visual}
	g.shuffle(&q)
	return q, true
}

func containsString(list []string, s string) bool {
	for _, v := range list {
		if v == s {
			return true
		}
	}
	return false
}

// Choice returns a multiple choice question: bank question or generated arithmetic.
func (g *Generator) Choice() Question {
	if it, ok := g.pick(g.source(TypeChoice)); ok {
		q := Question{Key: it.Key, Subject: it.Subject, Prompt: it.Prompt, Hint: it.Hint, Options: append([]Text(nil), it.Options...), Answer: it.Answer, FromBank: true, Points: it.Points, Level: points.Level(it.Level), Visual: it.Visual}
		g.shuffle(&q)
		return q
	}
	a, b, op, ans := g.arithmetic()
	options := []int{ans}
	for len(options) < 4 {
		delta := g.Rand.IntN(9) - 4
		if delta == 0 {
			delta = 5
		}
		cand := ans + delta
		dup := false
		for _, o := range options {
			if o == cand {
				dup = true
			}
		}
		if !dup {
			options = append(options, cand)
		}
	}
	q := Question{Key: fmt.Sprintf("math-%d%s%d", a, op, b), Subject: "math", Prompt: same(fmt.Sprintf("%d %s %d = ?", a, op, b)), Answer: 0, Level: g.level()}
	for _, o := range options {
		q.Options = append(q.Options, same(fmt.Sprint(o)))
	}
	q.Hint = same(fmt.Sprintf("%d %s %d = %d", a, op, b, ans))
	g.shuffle(&q)
	return q
}

// TrueFalse returns a statement question. A chosen subject without true/false
// questions turns one of its own multiple choice questions into a statement
// instead of borrowing another subject's statements (players saw questions of
// other subjects in true/false gates although they picked one subject).
func (g *Generator) TrueFalse() Question {
	before := g.fellBack
	items, pooled := g.source(TypeTrueFalse)
	if g.fellBack && !before {
		g.fellBack = before
		if q, ok := g.choiceAsTrueFalse(); ok {
			return q
		}
		g.fellBack = true
	}
	if it, ok := g.pick(items, pooled); ok {
		return Question{Key: it.Key, Subject: it.Subject, Prompt: it.Prompt, Answer: it.Answer, FromBank: true, Points: it.Points, Level: points.Level(it.Level), Visual: it.Visual}
	}
	a, b, op, ans := g.arithmetic()
	shown, truth := ans, 1
	if g.Rand.IntN(2) == 0 {
		shown, truth = ans+1+g.Rand.IntN(3), 0
	}
	return Question{Key: fmt.Sprintf("tfm-%d%s%d", a, op, b), Subject: "math", Prompt: same(fmt.Sprintf("%d %s %d = %d", a, op, b, shown)), Answer: truth, Level: g.level()}
}

// choiceAsTrueFalse turns a multiple choice question of the chosen subject
// into a statement: the prompt with one option, true when it is the right
// answer (half the time). ok is false when the subject has no usable choice
// question either, or when its choice pool is itself a fallback.
func (g *Generator) choiceAsTrueFalse() (Question, bool) {
	before := g.fellBack
	items, pooled := g.source(TypeChoice)
	if g.fellBack && !before {
		g.fellBack = before
		return Question{}, false
	}
	usable := make([]Item, 0, len(items))
	for _, it := range items {
		if it.Answer < 0 || it.Answer >= len(it.Options) || len(it.Options) < 2 {
			continue
		}
		plain := true
		for _, o := range it.Options {
			plain = plain && o.Media == nil && o.ID != ""
		}
		if plain {
			usable = append(usable, it)
		}
	}
	it, ok := g.pick(usable, pooled)
	if !ok {
		return Question{}, false
	}
	shown, truth := it.Answer, 1
	if g.Rand.IntN(2) == 0 {
		shown = (it.Answer + 1 + g.Rand.IntN(len(it.Options)-1)) % len(it.Options)
		truth = 0
	}
	opt := it.Options[shown]
	en := opt.EN
	if en == "" {
		en = opt.ID
	}
	promptEN := it.Prompt.EN
	if promptEN == "" {
		promptEN = it.Prompt.ID
	}
	prompt := Text{ID: it.Prompt.ID + "\nJawaban: " + opt.ID, EN: promptEN + "\nAnswer: " + en}
	return Question{Key: it.Key, Subject: it.Subject, Prompt: prompt, Answer: truth, FromBank: true, Points: it.Points, Level: points.Level(it.Level), Visual: it.Visual, Shown: &shown}, true
}

// Arithmetic returns an open numeric question for the math sprint.
func (g *Generator) Arithmetic() Question {
	a, b, op, ans := g.arithmetic()
	return Question{Key: "sprint", Subject: "math", Prompt: same(fmt.Sprintf("%d %s %d = ?", a, op, b)), Answer: ans, Level: g.level()}
}

// bank is the arithmetic band: the grade's band, one band harder for
// medium and two for expert (capped at the highest band).
func (g *Generator) bank() int { return min(3, Band(g.Grade)+g.level()-1) }

func (g *Generator) arithmetic() (int, int, string, int) {
	r := g.Rand
	switch g.bank() {
	case 0:
		a, b := 1+r.IntN(20), 1+r.IntN(10)
		if r.IntN(2) == 0 || (g.Grade == 1 && g.level() == points.LevelEasy) {
			return a, b, "+", a + b
		}
		if a < b {
			a, b = b, a
		}
		return a, b, "−", a - b
	case 1:
		switch r.IntN(3) {
		case 0:
			a, b := 2+r.IntN(11), 2+r.IntN(11)
			return a, b, "×", a * b
		case 1:
			b, q := 2+r.IntN(9), 2+r.IntN(11)
			return b * q, b, "÷", q
		default:
			a, b := 50+r.IntN(450), 10+r.IntN(90)
			return a, b, "+", a + b
		}
	case 2:
		switch r.IntN(3) {
		case 0:
			a, b := 11+r.IntN(19), 3+r.IntN(9)
			return a, b, "×", a * b
		case 1:
			a, b := -20+r.IntN(41), -15+r.IntN(31)
			return a, b, "+", a + b
		default:
			b, q := 3+r.IntN(13), 3+r.IntN(13)
			return b * q, b, "÷", q
		}
	default:
		switch r.IntN(3) {
		case 0:
			a, b := 12+r.IntN(38), 12+r.IntN(38)
			return a, b, "×", a * b
		case 1:
			a, b := 2+r.IntN(4), 2+r.IntN(5)
			p := 1
			for i := 0; i < b; i++ {
				p *= a
			}
			return a, b, "^", p
		default:
			a, b := -99+r.IntN(199), -99+r.IntN(199)
			return a, b, "−", a - b
		}
	}
}

func (g *Generator) shuffle(q *Question) {
	order := q.origins()
	g.Rand.Shuffle(len(q.Options), func(i, j int) {
		q.Options[i], q.Options[j] = q.Options[j], q.Options[i]
		order[i], order[j] = order[j], order[i]
	})
	answer := q.Answer
	if q.Order != nil {
		answer = q.Order[q.Answer]
	}
	q.Order = order
	for i, o := range order {
		if o == answer {
			q.Answer = i
			return
		}
	}
}

// origins returns a copy of the displayed->original mapping (identity when unset).
func (q Question) origins() []int {
	order := make([]int, len(q.Options))
	for i := range order {
		order[i] = i
		if i < len(q.Order) {
			order[i] = q.Order[i]
		}
	}
	return order
}

// reshuffleTries bounds the attempts to find an unseen option order.
const reshuffleTries = 32

// Present prepares a multiple choice question for display: it trims the
// options to n (n <= 0 keeps them all) and, when the same question already
// appeared earlier in this game, reorders the options so the correct answer
// moves to a position not used before (or at least away from its last
// position) and the overall order differs from every earlier showing.
func (g *Generator) Present(q Question, n int) Question {
	if n > 0 {
		q = Trim(q, n, g.Rand)
	}
	if len(q.Options) < 2 {
		return q
	}
	q.Options = append([]Text(nil), q.Options...)
	q.Order = q.origins()
	key := q.identity()
	if g.shown == nil {
		g.shown = map[string][]arrangement{}
	}
	previous := g.shown[key]
	if len(previous) > 0 {
		target := g.freshPosition(len(q.Options), previous)
		best, bestScore := q, -1
		for try := 0; try < reshuffleTries && bestScore < 3; try++ {
			candidate := q
			candidate.Options = append([]Text(nil), q.Options...)
			candidate.Order = append([]int(nil), q.Order...)
			g.shuffle(&candidate)
			candidate.moveAnswer(target)
			if score := candidate.arrangementScore(previous); score > bestScore {
				best, bestScore = candidate, score
			}
		}
		q = best
	}
	g.shown[key] = append(previous, q.arrangement())
	return q
}

// freshPosition picks a random answer position never used in previous
// showings, or, once every position was used, any position except the last.
func (g *Generator) freshPosition(options int, previous []arrangement) int {
	used := map[int]bool{}
	for _, p := range previous {
		used[p.answer] = true
	}
	last := previous[len(previous)-1].answer
	candidates := []int{}
	for i := 0; i < options; i++ {
		if !used[i] {
			candidates = append(candidates, i)
		}
	}
	if len(candidates) == 0 {
		for i := 0; i < options; i++ {
			if i != last {
				candidates = append(candidates, i)
			}
		}
	}
	return candidates[g.Rand.IntN(len(candidates))]
}

// moveAnswer swaps the correct option into displayed position target.
func (q *Question) moveAnswer(target int) {
	if target == q.Answer || target < 0 || target >= len(q.Options) {
		return
	}
	q.Options[q.Answer], q.Options[target] = q.Options[target], q.Options[q.Answer]
	q.Order[q.Answer], q.Order[target] = q.Order[target], q.Order[q.Answer]
	q.Answer = target
}

// identity is what repeats are tracked by: the key plus the prompt, so
// generated content sharing a key prefix is never mistaken for a repeat.
func (q Question) identity() string { return q.Key + "\x1f" + q.Prompt.ID }

func (q Question) arrangement() arrangement {
	signature := ""
	for _, o := range q.Options {
		signature += o.ID + "\x1f"
	}
	return arrangement{answer: q.Answer, signature: signature}
}

// arrangementScore rates how different q's order is from earlier showings:
// +2 when the answer sits at a position never used before, +1 when the full
// order is new; the answer staying at the last position scores 0.
func (q Question) arrangementScore(previous []arrangement) int {
	current := q.arrangement()
	if current.answer == previous[len(previous)-1].answer {
		return 0
	}
	score := 2
	for _, p := range previous {
		if p.answer == current.answer {
			score = 1
			break
		}
	}
	for _, p := range previous {
		if p.signature == current.signature {
			return score
		}
	}
	return score + 1
}

// Trim keeps the correct answer and up to n-1 random distractors, shuffled.
func Trim(q Question, n int, r *rand.Rand) Question {
	if len(q.Options) <= n {
		return q
	}
	keep := []int{q.Answer}
	for _, i := range r.Perm(len(q.Options)) {
		if len(keep) == n {
			break
		}
		if i != q.Answer {
			keep = append(keep, i)
		}
	}
	r.Shuffle(len(keep), func(a, b int) { keep[a], keep[b] = keep[b], keep[a] })
	origins := q.origins()
	out := q
	out.Options = make([]Text, 0, n)
	out.Order = make([]int, 0, n)
	for idx, i := range keep {
		out.Options = append(out.Options, q.Options[i])
		out.Order = append(out.Order, origins[i])
		if i == q.Answer {
			out.Answer = idx
		}
	}
	return out
}
