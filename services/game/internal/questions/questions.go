// Package questions provides grade-appropriate bilingual questions.
package questions

import (
	"fmt"
	"math/rand/v2"

	"edufunhub/game/internal/points"
)

// Text is a bilingual string (Indonesian default, English translation).
type Text struct {
	ID string `json:"id"`
	EN string `json:"en"`
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
}

// Worth returns the portal points of a correct answer to q.
func (q Question) Worth() int { return points.Question(q.Points) }

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
		{"science", Text{"Hewan yang hidup di air dan bernapas dengan insang adalah…", "An animal that lives in water and breathes with gills is a…"}, bi("Ikan", "Fish", "Kucing", "Cat", "Ayam", "Chicken", "Kambing", "Goat"), 0, Text{"Insang ada pada ikan.", "Fish have gills."}},
		{"science", Text{"Matahari terbit dari arah…", "The sun rises in the…"}, bi("Timur", "East", "Barat", "West", "Utara", "North", "Selatan", "South"), 0, Text{"Matahari terbit di timur.", "The sun rises in the east."}},
		{"science", Text{"Tumbuhan membutuhkan … untuk tumbuh.", "Plants need … to grow."}, bi("Air dan cahaya", "Water and light", "Pasir saja", "Only sand", "Plastik", "Plastic", "Gelap", "Darkness"), 0, Text{"Tumbuhan butuh air dan cahaya matahari.", "Plants need water and sunlight."}},
		{"language", Text{"Lawan kata \"besar\" adalah…", "The opposite of \"big\" is…"}, bi("Kecil", "Small", "Tinggi", "Tall", "Luas", "Wide", "Berat", "Heavy"), 0, Text{"Besar lawan katanya kecil.", "Big is the opposite of small."}},
		{"language", Text{"Huruf vokal adalah…", "Which one is a vowel?"}, opts("A", "B", "K", "T"), 0, Text{"Vokal: A, I, U, E, O.", "Vowels: A, E, I, O, U."}},
		{"social", Text{"Warna bendera Indonesia adalah…", "The colours of Indonesia's flag are…"}, bi("Merah putih", "Red and white", "Biru putih", "Blue and white", "Merah kuning", "Red and yellow", "Hijau putih", "Green and white"), 0, Text{"Sang Saka Merah Putih.", "The Red and White flag."}},
		{"social", Text{"Dalam seminggu ada … hari.", "There are … days in a week."}, opts("7", "5", "6", "10"), 0, Text{"Senin sampai Minggu = 7 hari.", "Monday to Sunday = 7 days."}},
		{"english", Text{"Bahasa Inggris dari \"kucing\" adalah…", "Which word means a small furry pet that says \"meow\"?"}, opts("Cat", "Dog", "Bird", "Fish"), 0, Text{"Kucing = cat.", "A cat says meow."}},
		{"civics", Text{"Sila pertama Pancasila adalah…", "The first principle of Pancasila is…"}, bi("Ketuhanan Yang Maha Esa", "Belief in the One and Only God", "Persatuan Indonesia", "Unity of Indonesia", "Keadilan sosial", "Social justice", "Kerakyatan", "Democracy"), 0, Text{"Sila ke-1: Ketuhanan Yang Maha Esa.", "Principle 1: Belief in the One and Only God."}},
		{"science", Text{"Bagian tubuh untuk melihat adalah…", "The body part we use to see is the…"}, bi("Mata", "Eyes", "Telinga", "Ears", "Hidung", "Nose", "Lidah", "Tongue"), 0, Text{"Kita melihat dengan mata.", "We see with our eyes."}},
	},
	{ // Grade 4-6
		{"science", Text{"Proses tumbuhan membuat makanan sendiri disebut…", "The process by which plants make their own food is called…"}, bi("Fotosintesis", "Photosynthesis", "Respirasi", "Respiration", "Evaporasi", "Evaporation", "Penyerbukan", "Pollination"), 0, Text{"Fotosintesis memakai cahaya matahari.", "Photosynthesis uses sunlight."}},
		{"science", Text{"Planet terdekat dengan Matahari adalah…", "The planet closest to the Sun is…"}, bi("Merkurius", "Mercury", "Venus", "Venus", "Bumi", "Earth", "Mars", "Mars"), 0, Text{"Urutan: Merkurius, Venus, Bumi…", "Order: Mercury, Venus, Earth…"}},
		{"science", Text{"Perubahan wujud air menjadi uap disebut…", "Water changing into vapour is called…"}, bi("Menguap", "Evaporation", "Membeku", "Freezing", "Mencair", "Melting", "Mengembun", "Condensation"), 0, Text{"Cair ke gas = menguap.", "Liquid to gas = evaporation."}},
		{"social", Text{"Ibu kota Provinsi Jawa Barat adalah…", "The capital of West Java province is…"}, opts("Bandung", "Semarang", "Surabaya", "Serang"), 0, Text{"Bandung adalah ibu kota Jawa Barat.", "Bandung is West Java's capital."}},
		{"social", Text{"Proklamasi kemerdekaan Indonesia dibacakan tahun…", "Indonesia's independence was proclaimed in…"}, opts("1945", "1942", "1949", "1950"), 0, Text{"17 Agustus 1945.", "17 August 1945."}},
		{"language", Text{"Kalimat yang menggunakan tanda tanya adalah kalimat…", "A sentence that ends with a question mark is a…"}, bi("Tanya", "Question", "Perintah", "Command", "Berita", "Statement", "Seru", "Exclamation"), 0, Text{"Kalimat tanya diakhiri tanda tanya.", "Questions end with a question mark."}},
		{"english", Text{"\"I … to school every day.\"", "\"I … to school every day.\""}, opts("go", "goes", "going", "went"), 0, Text{"Subjek I memakai go.", "Subject I uses go."}},
		{"civics", Text{"Lambang negara Indonesia adalah…", "Indonesia's national emblem is…"}, bi("Garuda Pancasila", "Garuda Pancasila", "Bintang", "A star", "Banteng", "A bull", "Padi dan kapas", "Rice and cotton"), 0, Text{"Garuda Pancasila.", "Garuda Pancasila."}},
		{"science", Text{"Hewan pemakan tumbuhan disebut…", "Animals that eat only plants are called…"}, bi("Herbivora", "Herbivores", "Karnivora", "Carnivores", "Omnivora", "Omnivores", "Dekomposer", "Decomposers"), 0, Text{"Herbivora makan tumbuhan.", "Herbivores eat plants."}},
		{"social", Text{"Mata uang Indonesia adalah…", "Indonesia's currency is the…"}, opts("Rupiah", "Ringgit", "Baht", "Peso"), 0, Text{"Rupiah (Rp).", "Rupiah (Rp)."}},
	},
	{ // Grade 7-9
		{"science", Text{"Satuan kuat arus listrik dalam SI adalah…", "The SI unit of electric current is the…"}, bi("Ampere", "Ampere", "Volt", "Volt", "Ohm", "Ohm", "Watt", "Watt"), 0, Text{"Arus diukur dalam ampere.", "Current is measured in amperes."}},
		{"science", Text{"Organel tempat fotosintesis adalah…", "The organelle where photosynthesis happens is the…"}, bi("Kloroplas", "Chloroplast", "Mitokondria", "Mitochondrion", "Ribosom", "Ribosome", "Vakuola", "Vacuole"), 0, Text{"Kloroplas mengandung klorofil.", "Chloroplasts contain chlorophyll."}},
		{"science", Text{"Rumus kimia air adalah…", "The chemical formula of water is…"}, opts("H₂O", "CO₂", "O₂", "NaCl"), 0, Text{"Dua hidrogen, satu oksigen.", "Two hydrogens, one oxygen."}},
		{"social", Text{"ASEAN didirikan melalui Deklarasi…", "ASEAN was founded through the … Declaration."}, opts("Bangkok", "Jakarta", "Manila", "Kuala Lumpur"), 0, Text{"Deklarasi Bangkok 1967.", "The 1967 Bangkok Declaration."}},
		{"social", Text{"Garis khayal yang membagi bumi utara dan selatan adalah…", "The imaginary line dividing north and south is the…"}, bi("Khatulistiwa", "Equator", "Meridian", "Meridian", "Garis balik", "Tropic", "Garis bujur", "Longitude"), 0, Text{"Khatulistiwa = lintang 0°.", "The equator is 0° latitude."}},
		{"language", Text{"Teks yang bertujuan meyakinkan pembaca disebut teks…", "A text written to convince readers is a … text."}, bi("Persuasi", "Persuasive", "Narasi", "Narrative", "Deskripsi", "Descriptive", "Prosedur", "Procedure"), 0, Text{"Persuasi = mengajak/meyakinkan.", "Persuasive texts convince."}},
		{"english", Text{"Past tense of \"write\" is…", "The past tense of \"write\" is…"}, opts("wrote", "writed", "written", "writes"), 0, Text{"write – wrote – written.", "write – wrote – written."}},
		{"civics", Text{"Lembaga yang berwenang mengubah UUD 1945 adalah…", "The body authorised to amend the 1945 Constitution is the…"}, opts("MPR", "DPR", "MA", "KPU"), 0, Text{"MPR berwenang mengubah UUD.", "The MPR can amend the constitution."}},
		{"math", Text{"Gradien garis y = 3x + 2 adalah…", "The gradient of y = 3x + 2 is…"}, opts("3", "2", "5", "1/3"), 0, Text{"y = mx + c, m = 3.", "y = mx + c, m = 3."}},
		{"math", Text{"Sudut-sudut segitiga berjumlah…", "The angles of a triangle add up to…"}, opts("180°", "90°", "360°", "270°"), 0, Text{"Jumlah sudut segitiga 180°.", "Triangle angles sum to 180°."}},
	},
	{ // Grade 10-12
		{"science", Text{"Hukum Newton II dirumuskan sebagai…", "Newton's second law is written as…"}, opts("F = m·a", "E = m·c²", "V = I·R", "P = W/t"), 0, Text{"Gaya = massa × percepatan.", "Force = mass × acceleration."}},
		{"science", Text{"Bilangan Avogadro kira-kira…", "Avogadro's number is approximately…"}, opts("6,02 × 10²³", "3,00 × 10⁸", "9,81", "1,6 × 10⁻¹⁹"), 0, Text{"Jumlah partikel per mol.", "Particles per mole."}},
		{"science", Text{"Molekul pembawa informasi genetik adalah…", "The molecule that carries genetic information is…"}, opts("DNA", "ATP", "Glukosa", "Lipid"), 0, Text{"DNA menyimpan kode genetik.", "DNA stores the genetic code."}},
		{"math", Text{"Turunan dari f(x) = x³ adalah…", "The derivative of f(x) = x³ is…"}, opts("3x²", "x²", "3x", "x⁴/4"), 0, Text{"d/dx xⁿ = n·xⁿ⁻¹.", "d/dx xⁿ = n·xⁿ⁻¹."}},
		{"math", Text{"Nilai sin 30° adalah…", "The value of sin 30° is…"}, opts("1/2", "√3/2", "1", "0"), 0, Text{"sin 30° = 0,5.", "sin 30° = 0.5."}},
		{"math", Text{"log₁₀ 1000 = …", "log₁₀ 1000 = …"}, opts("3", "2", "10", "100"), 0, Text{"10³ = 1000.", "10³ = 1000."}},
		{"social", Text{"Konferensi Asia Afrika 1955 diadakan di…", "The 1955 Asian–African Conference was held in…"}, opts("Bandung", "Jakarta", "Yogyakarta", "Bogor"), 0, Text{"KAA di Bandung.", "It took place in Bandung."}},
		{"social", Text{"Inflasi adalah kenaikan … secara umum dan terus-menerus.", "Inflation is a general, continuous rise in…"}, bi("Harga", "Prices", "Upah saja", "Wages only", "Ekspor", "Exports", "Pajak", "Taxes"), 0, Text{"Inflasi = harga naik terus.", "Inflation = rising prices."}},
		{"english", Text{"\"If I … rich, I would travel the world.\"", "\"If I … rich, I would travel the world.\""}, opts("were", "am", "will be", "being"), 0, Text{"Conditional tipe 2 memakai were.", "Second conditional uses were."}},
		{"language", Text{"Majas yang membandingkan secara langsung tanpa kata \"seperti\" adalah…", "A figure of speech comparing directly without \"like\" is a…"}, bi("Metafora", "Metaphor", "Simile", "Simile", "Hiperbola", "Hyperbole", "Personifikasi", "Personification"), 0, Text{"Metafora = perbandingan langsung.", "A metaphor compares directly."}},
	},
}

type tf struct {
	subject string
	prompt  Text
	answer  bool
}

var truthBank = [4][]tf{
	{
		{"science", Text{"Ikan bernapas menggunakan paru-paru.", "Fish breathe with lungs."}, false},
		{"science", Text{"Es akan mencair jika dipanaskan.", "Ice melts when heated."}, true},
		{"social", Text{"Indonesia merdeka pada tanggal 17 Agustus.", "Indonesia became independent on 17 August."}, true},
		{"science", Text{"Bulan memancarkan cahayanya sendiri.", "The Moon makes its own light."}, false},
		{"english", Text{"\"Apple\" dalam bahasa Indonesia berarti apel.", "An apple is a fruit."}, true},
		{"science", Text{"Laba-laba memiliki enam kaki.", "Spiders have six legs."}, false},
	},
	{
		{"science", Text{"Jantung berfungsi memompa darah.", "The heart pumps blood."}, true},
		{"science", Text{"Bumi berputar pada porosnya disebut revolusi.", "Earth spinning on its axis is called revolution."}, false},
		{"social", Text{"Pulau terbesar di Indonesia adalah Pulau Jawa.", "Java is Indonesia's largest island."}, false},
		{"civics", Text{"Pancasila memiliki lima sila.", "Pancasila has five principles."}, true},
		{"science", Text{"Kelelawar termasuk mamalia.", "Bats are mammals."}, true},
		{"english", Text{"\"She go to school\" adalah kalimat yang benar.", "\"She go to school\" is grammatically correct."}, false},
	},
	{
		{"science", Text{"Cahaya merambat lebih cepat daripada bunyi.", "Light travels faster than sound."}, true},
		{"science", Text{"Mitokondria adalah tempat respirasi sel.", "Mitochondria are where cellular respiration happens."}, true},
		{"social", Text{"Indonesia terletak di antara dua benua dan dua samudra.", "Indonesia lies between two continents and two oceans."}, true},
		{"science", Text{"Logam adalah isolator listrik yang baik.", "Metals are good electrical insulators."}, false},
		{"civics", Text{"DPR adalah lembaga yudikatif.", "The DPR is a judicial institution."}, false},
		{"english", Text{"\"Children\" adalah bentuk jamak dari \"child\".", "\"Children\" is the plural of \"child\"."}, true},
	},
	{
		{"science", Text{"Elektron bermuatan positif.", "Electrons carry a positive charge."}, false},
		{"science", Text{"Enzim adalah biokatalisator.", "Enzymes are biological catalysts."}, true},
		{"math", Text{"Bilangan π adalah bilangan rasional.", "π is a rational number."}, false},
		{"social", Text{"Sumpah Pemuda diikrarkan pada tahun 1928.", "The Youth Pledge was declared in 1928."}, true},
		{"science", Text{"Percepatan gravitasi bumi kira-kira 9,8 m/s².", "Earth's gravitational acceleration is about 9.8 m/s²."}, true},
		{"english", Text{"\"Has been\" menandakan present perfect continuous.", "\"Has been + -ing\" forms the present perfect continuous."}, true},
	},
}

// Generator produces questions. Rand is injectable for deterministic tests.
type Generator struct {
	Grade int
	// Game limits bank questions to those distributed to this game ("" = any).
	Game string
	// Subject limits questions to one subject; "" (or Mix) mixes every subject.
	Subject string
	// Players whose history steers the order: questions they have not seen
	// (or saw longest ago) come first, so every game starts differently.
	Players  []int64
	Rand     *rand.Rand
	used     map[string]bool
	fellBack bool
}

// New returns a generator for a grade with a seeded source.
func New(grade int, seed uint64) *Generator {
	return NewFor("", grade, seed)
}

// NewFor returns a generator that only draws bank questions distributed to game.
func NewFor(game string, grade int, seed uint64) *Generator {
	return &Generator{Grade: grade, Game: game, Rand: rand.New(rand.NewPCG(seed, seed^0x9e3779b97f4a7c15)), used: map[string]bool{}}
}

// For narrows the generator to a subject and the players at the table.
func (g *Generator) For(subject string, players ...int64) *Generator {
	g.Subject = NormSubject(subject)
	g.Players = players
	return g
}

// mathAllowed reports whether generated arithmetic fits the chosen subject.
func (g *Generator) mathAllowed() bool { return g.Subject == "" || g.Subject == "math" }

// items returns the bank items for this generator's grade and subject. The
// game's own pool comes first; when it has nothing for the subject (or for
// the grade at all), the subject's questions distributed to other games and
// then the built-in bank are used, so a chosen subject is never replaced by
// generated arithmetic. Only when no pool has the subject does the game fall
// back to the mix, and Fallback then reports it to the players.
func (g *Generator) items(kind string) []Item {
	pools := [][]Item{
		Current().filter(kind, g.Grade, g.Game),
		Current().filter(kind, g.Grade, ""),
		builtin.filter(kind, g.Grade, ""),
	}
	for _, pool := range pools {
		if out := bySubject(pool, g.Subject); len(out) > 0 {
			return out
		}
	}
	if g.Subject == "" || g.Subject == "math" {
		return nil
	}
	g.fellBack = true
	for _, pool := range pools {
		if len(pool) > 0 {
			return pool
		}
	}
	return nil
}

// bySubject keeps the items of one subject ("" keeps every item).
func bySubject(items []Item, subject string) []Item {
	if subject == "" {
		return items
	}
	out := make([]Item, 0, len(items))
	for _, it := range items {
		if it.Subject == subject {
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
// math.
func (g *Generator) pick(items []Item) (Item, bool) {
	if len(items) == 0 {
		return Item{}, false
	}
	// Mixed play with arithmetic keeps some generated math in the rotation.
	if g.mathAllowed() && g.Rand.IntN(4) == 0 {
		return Item{}, false
	}
	exhausted := true
	for _, it := range items {
		exhausted = exhausted && g.used[it.Key]
	}
	if exhausted && !g.mathAllowed() {
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
func (g *Generator) BankChoice(subjects ...string) (Question, bool) {
	all := Current().filter(TypeChoice, g.Grade, g.Game)
	items := make([]Item, 0, len(all))
	for _, it := range all {
		if len(subjects) == 0 || containsString(subjects, it.Subject) {
			items = append(items, it)
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
		return Question{}, false
	}
	g.used[best.Key] = true
	History.Mark(g.Players, best.Key)
	q := Question{Key: best.Key, Subject: best.Subject, Prompt: best.Prompt, Hint: best.Hint, Options: append([]Text(nil), best.Options...), Answer: best.Answer, FromBank: true, Points: best.Points}
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
	if it, ok := g.pick(g.items(TypeChoice)); ok {
		q := Question{Key: it.Key, Subject: it.Subject, Prompt: it.Prompt, Hint: it.Hint, Options: append([]Text(nil), it.Options...), Answer: it.Answer, FromBank: true, Points: it.Points}
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
	q := Question{Key: fmt.Sprintf("math-%d%s%d", a, op, b), Subject: "math", Prompt: same(fmt.Sprintf("%d %s %d = ?", a, op, b)), Answer: 0}
	for _, o := range options {
		q.Options = append(q.Options, same(fmt.Sprint(o)))
	}
	q.Hint = same(fmt.Sprintf("%d %s %d = %d", a, op, b, ans))
	g.shuffle(&q)
	return q
}

// TrueFalse returns a statement question.
func (g *Generator) TrueFalse() Question {
	if it, ok := g.pick(g.items(TypeTrueFalse)); ok {
		return Question{Key: it.Key, Subject: it.Subject, Prompt: it.Prompt, Answer: it.Answer, FromBank: true, Points: it.Points}
	}
	a, b, op, ans := g.arithmetic()
	shown, truth := ans, 1
	if g.Rand.IntN(2) == 0 {
		shown, truth = ans+1+g.Rand.IntN(3), 0
	}
	return Question{Key: fmt.Sprintf("tfm-%d%s%d", a, op, b), Subject: "math", Prompt: same(fmt.Sprintf("%d %s %d = %d", a, op, b, shown)), Answer: truth}
}

// Arithmetic returns an open numeric question for the math sprint.
func (g *Generator) Arithmetic() Question {
	a, b, op, ans := g.arithmetic()
	return Question{Key: "sprint", Subject: "math", Prompt: same(fmt.Sprintf("%d %s %d = ?", a, op, b)), Answer: ans}
}

func (g *Generator) bank() int { return Band(g.Grade) }

func (g *Generator) arithmetic() (int, int, string, int) {
	r := g.Rand
	switch g.bank() {
	case 0:
		a, b := 1+r.IntN(20), 1+r.IntN(10)
		if r.IntN(2) == 0 || g.Grade == 1 {
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
	correct := q.Options[q.Answer]
	g.Rand.Shuffle(len(q.Options), func(i, j int) { q.Options[i], q.Options[j] = q.Options[j], q.Options[i] })
	for i, o := range q.Options {
		if o == correct {
			q.Answer = i
			return
		}
	}
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
	out := q
	out.Options = make([]Text, 0, n)
	for idx, i := range keep {
		out.Options = append(out.Options, q.Options[i])
		if i == q.Answer {
			out.Answer = idx
		}
	}
	return out
}
