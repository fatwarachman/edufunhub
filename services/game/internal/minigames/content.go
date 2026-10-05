package minigames

import (
	"fmt"
	"math/rand/v2"
	"strings"
	"time"

	"edufunhub/game/internal/questions"
)

// T builds a bilingual text.
func T(id, en string) questions.Text { return questions.Text{ID: id, EN: en} }

// S builds a text that reads the same in both languages.
func S(s string) questions.Text { return questions.Text{ID: s, EN: s} }

// build assembles a shuffled multiple choice question. Distractors equal to
// the answer or to each other are dropped; the key is derived from the prompt.
func build(r *rand.Rand, key, subject string, prompt, hint, answer questions.Text, distractors ...questions.Text) questions.Question {
	opts := []questions.Text{answer}
	seen := map[string]bool{answer.ID: true}
	for _, d := range distractors {
		if d.ID == "" || seen[d.ID] {
			continue
		}
		seen[d.ID] = true
		opts = append(opts, d)
	}
	r.Shuffle(len(opts), func(i, j int) { opts[i], opts[j] = opts[j], opts[i] })
	ans := 0
	for i, o := range opts {
		if o.ID == answer.ID {
			ans = i
		}
	}
	return questions.Question{Key: key, Subject: subject, Prompt: prompt, Hint: hint, Options: opts, Answer: ans}
}

// numberOptions returns distinct wrong numbers near answer (never negative).
func numberOptions(r *rand.Rand, answer, spread, n int) []int {
	out := []int{}
	seen := map[int]bool{answer: true}
	for tries := 0; len(out) < n && tries < 100; tries++ {
		d := (1 + r.IntN(spread)) * (1 - 2*r.IntN(2))
		if v := answer + d; v >= 0 && !seen[v] {
			seen[v] = true
			out = append(out, v)
		}
	}
	return out
}

// Rupiah formats an amount as "Rp12.500".
func Rupiah(v int) string {
	s := fmt.Sprint(v)
	var b strings.Builder
	for i, c := range s {
		if i > 0 && (len(s)-i)%3 == 0 {
			b.WriteByte('.')
		}
		b.WriteRune(c)
	}
	return "Rp" + b.String()
}

func rupiahTexts(vals []int) []questions.Text {
	out := make([]questions.Text, len(vals))
	for i, v := range vals {
		out[i] = S(Rupiah(v))
	}
	return out
}

func numTexts(vals []int) []questions.Text {
	out := make([]questions.Text, len(vals))
	for i, v := range vals {
		out[i] = S(fmt.Sprint(v))
	}
	return out
}

func pick[T any](r *rand.Rand, list []T) T { return list[r.IntN(len(list))] }

// byBand scales a round time by grade: kindergarten and early grades get
// more reading time.
func byBand(k, low, mid, high time.Duration) func(int) time.Duration {
	return func(grade int) time.Duration {
		switch {
		case grade == 0:
			return k
		case grade <= 3:
			return low
		case grade <= 6:
			return mid
		}
		return high
	}
}

// ---------------------------------------------------------------- Market Math

type ware struct {
	icon  string
	name  questions.Text
	price int // base price in rupiah for young grades
}

var wares = []ware{
	{"apple", T("Apel", "Apple"), 2000},
	{"banana", T("Pisang", "Banana"), 1500},
	{"milk", T("Susu kotak", "Milk carton"), 4000},
	{"egg", T("Telur", "Egg"), 2500},
	{"pencil", T("Pensil", "Pencil"), 3000},
	{"book", T("Buku tulis", "Notebook"), 5000},
	{"cookie", T("Kue", "Cookie"), 1000},
	{"candy", T("Permen", "Candy"), 500},
	{"carrot", T("Wortel", "Carrot"), 1500},
	{"croissant", T("Roti", "Bread"), 6000},
	{"shirt", T("Kaos", "T-shirt"), 45000},
	{"ice-cream", T("Es krim", "Ice cream"), 7000},
}

func shopVisual(items []Item, note questions.Text) Visual {
	return Visual{Kind: "shop", Items: items, Note: note}
}

func makeMarket(grade int, r *rand.Rand) Round {
	band := questions.Band(grade)
	switch {
	case grade == 0:
		// Count the coins/items in the basket.
		w := pick(r, wares)
		n := 2 + r.IntN(6)
		q := build(r, fmt.Sprintf("mm-count-%s-%d", w.icon, n), "math",
			T(fmt.Sprintf("Ada berapa %s di keranjang?", strings.ToLower(w.name.ID)), fmt.Sprintf("How many %ss are in the basket?", strings.ToLower(w.name.EN))),
			T(fmt.Sprintf("Hitung satu per satu: ada %d.", n), fmt.Sprintf("Count them one by one: %d.", n)),
			S(fmt.Sprint(n)), numTexts(numberOptions(r, n, 3, 3))...)
		return Round{Question: q, Visual: shopVisual([]Item{{Icon: w.icon, Label: w.name, Count: n}}, T("Keranjang belanja", "Shopping basket"))}
	case band == 0:
		// Total of two items, or change from a note.
		a, b := pick(r, wares[:10]), pick(r, wares[:10])
		for b.icon == a.icon {
			b = pick(r, wares[:10])
		}
		total := a.price + b.price
		if grade >= 2 && r.IntN(2) == 0 {
			paid := 10000
			if total > paid {
				paid = 20000
			}
			change := paid - total
			q := build(r, fmt.Sprintf("mm-change-%s-%s-%d", a.icon, b.icon, paid), "math",
				T(fmt.Sprintf("Kamu beli %s dan %s, lalu bayar %s. Berapa kembaliannya?", strings.ToLower(a.name.ID), strings.ToLower(b.name.ID), Rupiah(paid)),
					fmt.Sprintf("You buy a %s and a %s and pay %s. How much change do you get?", strings.ToLower(a.name.EN), strings.ToLower(b.name.EN), Rupiah(paid))),
				T(fmt.Sprintf("%s − %s = %s", Rupiah(paid), Rupiah(total), Rupiah(change)), fmt.Sprintf("%s − %s = %s", Rupiah(paid), Rupiah(total), Rupiah(change))),
				S(Rupiah(change)))
			return Round{Question: fixMoney(q, change, r), Visual: shopVisual([]Item{{Icon: a.icon, Label: a.name, Value: Rupiah(a.price), Count: 1}, {Icon: b.icon, Label: b.name, Value: Rupiah(b.price), Count: 1}}, T("Bayar "+Rupiah(paid), "Pay "+Rupiah(paid)))}
		}
		q := build(r, fmt.Sprintf("mm-sum-%s-%s", a.icon, b.icon), "math",
			T(fmt.Sprintf("Berapa harga %s dan %s jika dibeli bersama?", strings.ToLower(a.name.ID), strings.ToLower(b.name.ID)),
				fmt.Sprintf("How much do a %s and a %s cost together?", strings.ToLower(a.name.EN), strings.ToLower(b.name.EN))),
			T(fmt.Sprintf("%s + %s = %s", Rupiah(a.price), Rupiah(b.price), Rupiah(total)), fmt.Sprintf("%s + %s = %s", Rupiah(a.price), Rupiah(b.price), Rupiah(total))),
			S(Rupiah(total)))
		return Round{Question: fixMoney(q, total, r), Visual: shopVisual([]Item{{Icon: a.icon, Label: a.name, Value: Rupiah(a.price), Count: 1}, {Icon: b.icon, Label: b.name, Value: Rupiah(b.price), Count: 1}}, T("Daftar harga", "Price list"))}
	case band == 1:
		// Quantity × price, then change from a bigger note.
		w := pick(r, wares[:10])
		n := 2 + r.IntN(5)
		total := n * w.price
		paid := 50000
		if total > 40000 {
			paid = 100000
		}
		if r.IntN(2) == 0 {
			q := build(r, fmt.Sprintf("mm-mul-%s-%d", w.icon, n), "math",
				T(fmt.Sprintf("Harga 1 %s %s. Berapa harga %d %s?", strings.ToLower(w.name.ID), Rupiah(w.price), n, strings.ToLower(w.name.ID)),
					fmt.Sprintf("One %s costs %s. How much do %d cost?", strings.ToLower(w.name.EN), Rupiah(w.price), n)),
				T(fmt.Sprintf("%d × %s = %s", n, Rupiah(w.price), Rupiah(total)), fmt.Sprintf("%d × %s = %s", n, Rupiah(w.price), Rupiah(total))),
				S(Rupiah(total)))
			return Round{Question: fixMoney(q, total, r), Visual: shopVisual([]Item{{Icon: w.icon, Label: w.name, Value: Rupiah(w.price), Count: n}}, T(fmt.Sprintf("Beli %d", n), fmt.Sprintf("Buy %d", n)))}
		}
		change := paid - total
		q := build(r, fmt.Sprintf("mm-mulchange-%s-%d-%d", w.icon, n, paid), "math",
			T(fmt.Sprintf("Kamu beli %d %s seharga %s per buah dan membayar %s. Berapa kembaliannya?", n, strings.ToLower(w.name.ID), Rupiah(w.price), Rupiah(paid)),
				fmt.Sprintf("You buy %d × %s at %s each and pay %s. How much change?", n, strings.ToLower(w.name.EN), Rupiah(w.price), Rupiah(paid))),
			T(fmt.Sprintf("%s − (%d × %s) = %s", Rupiah(paid), n, Rupiah(w.price), Rupiah(change)), fmt.Sprintf("%s − (%d × %s) = %s", Rupiah(paid), n, Rupiah(w.price), Rupiah(change))),
			S(Rupiah(change)))
		return Round{Question: fixMoney(q, change, r), Visual: shopVisual([]Item{{Icon: w.icon, Label: w.name, Value: Rupiah(w.price), Count: n}}, T("Bayar "+Rupiah(paid), "Pay "+Rupiah(paid)))}
	case band == 2:
		// Percentage discount.
		w := pick(r, wares)
		price := w.price * (2 + r.IntN(4)) * 5
		disc := pick(r, []int{10, 20, 25, 30, 50})
		final := price * (100 - disc) / 100
		q := build(r, fmt.Sprintf("mm-disc-%s-%d-%d", w.icon, price, disc), "math",
			T(fmt.Sprintf("%s seharga %s mendapat diskon %d%%. Berapa harga setelah diskon?", w.name.ID, Rupiah(price), disc),
				fmt.Sprintf("A %s costing %s is %d%% off. What is the new price?", strings.ToLower(w.name.EN), Rupiah(price), disc)),
			T(fmt.Sprintf("%s − %d%% × %s = %s", Rupiah(price), disc, Rupiah(price), Rupiah(final)), fmt.Sprintf("%s − %d%% × %s = %s", Rupiah(price), disc, Rupiah(price), Rupiah(final))),
			S(Rupiah(final)), S(Rupiah(price*disc/100)), S(Rupiah(price-disc*100)))
		return Round{Question: fixMoney(q, final, r), Visual: shopVisual([]Item{{Icon: w.icon, Label: w.name, Value: Rupiah(price), Count: 1}}, T(fmt.Sprintf("Diskon %d%%", disc), fmt.Sprintf("%d%% off", disc)))}
	default:
		// Best value: price per unit of two packs.
		w := pick(r, wares[:10])
		na, nb := 2+r.IntN(3), 5+r.IntN(4)
		ua := w.price + 500*r.IntN(3)
		ub := w.price - 100*(1+r.IntN(4))
		if r.IntN(2) == 0 {
			ua, ub = ub, ua
		}
		pa, pb := na*ua, nb*ub
		cheaper := T(fmt.Sprintf("Paket %d (%s per buah)", na, Rupiah(ua)), fmt.Sprintf("Pack of %d (%s each)", na, Rupiah(ua)))
		other := T(fmt.Sprintf("Paket %d (%s per buah)", nb, Rupiah(ub)), fmt.Sprintf("Pack of %d (%s each)", nb, Rupiah(ub)))
		if ub < ua {
			cheaper, other = other, cheaper
		}
		q := build(r, fmt.Sprintf("mm-unit-%s-%d-%d-%d-%d", w.icon, na, pa, nb, pb), "math",
			T(fmt.Sprintf("Paket A: %d %s seharga %s. Paket B: %d seharga %s. Mana yang lebih hemat per buah?", na, strings.ToLower(w.name.ID), Rupiah(pa), nb, Rupiah(pb)),
				fmt.Sprintf("Pack A: %d × %s for %s. Pack B: %d for %s. Which is cheaper per item?", na, strings.ToLower(w.name.EN), Rupiah(pa), nb, Rupiah(pb))),
			T("Bagi harga paket dengan jumlah isinya.", "Divide each pack price by the number of items."),
			cheaper, other, T("Sama saja", "They cost the same"), T("Tidak bisa dihitung", "It cannot be worked out"))
		return Round{Question: q, Visual: shopVisual([]Item{{Icon: w.icon, Label: S("A"), Value: Rupiah(pa), Count: na}, {Icon: w.icon, Label: S("B"), Value: Rupiah(pb), Count: nb}}, T("Bandingkan harga", "Compare prices"))}
	}
}

// fixMoney replaces the options of a money question with the answer plus
// believable wrong amounts in steps of 500.
func fixMoney(q questions.Question, answer int, r *rand.Rand) questions.Question {
	wrong := []int{}
	seen := map[int]bool{answer: true}
	for tries := 0; len(wrong) < 3 && tries < 60; tries++ {
		v := answer + 500*(1+r.IntN(6))*(1-2*r.IntN(2))
		if v > 0 && !seen[v] {
			seen[v] = true
			wrong = append(wrong, v)
		}
	}
	return build(r, q.Key, q.Subject, q.Prompt, q.Hint, S(Rupiah(answer)), rupiahTexts(wrong)...)
}

// --------------------------------------------------- Number & Letter Garden

var flowerColors = []struct {
	key  string
	name questions.Text
}{
	{"#ff6584", T("merah muda", "pink")}, {"#ffd93d", T("kuning", "yellow")},
	{"#6c5ce7", T("ungu", "purple")}, {"#ff9e44", T("oranye", "orange")},
}

var gardenWords = []struct {
	id, en string
	icon   string
}{
	{"BUNGA", "FLOWER", "flower"}, {"DAUN", "LEAF", "leaf"}, {"KUPU", "MOTH", "bug"}, {"POHON", "TREE", "tree"},
	{"MATAHARI", "SUN", "sun"}, {"BURUNG", "BIRD", "bird"}, {"SIPUT", "SNAIL", "snail"}, {"WORTEL", "CARROT", "carrot"},
	{"APEL", "APPLE", "apple"}, {"AIR", "WATER", "droplets"}, {"TANAH", "SOIL", "sprout"}, {"LEBAH", "BEE", "bug"},
}

func makeGarden(grade int, r *rand.Rand) Round {
	kinds := []int{0, 1}
	switch questions.Band(grade) {
	case 0:
		if grade > 0 {
			kinds = []int{0, 1, 2, 3}
		}
	case 1:
		kinds = []int{2, 3, 4, 5}
	default:
		kinds = []int{4, 5, 6, 7}
	}
	switch pick(r, kinds) {
	case 0: // count flowers of one colour
		c := pick(r, flowerColors)
		n := 1 + r.IntN(min(9, 4+grade*3))
		other := pick(r, flowerColors)
		for other.key == c.key {
			other = pick(r, flowerColors)
		}
		m := 1 + r.IntN(5)
		q := build(r, fmt.Sprintf("ng-count-%s-%d-%d", c.key, n, m), "math",
			T(fmt.Sprintf("Berapa bunga %s di taman?", c.name.ID), fmt.Sprintf("How many %s flowers are in the garden?", c.name.EN)),
			T(fmt.Sprintf("Hitung hanya bunga %s: %d.", c.name.ID, n), fmt.Sprintf("Count only the %s flowers: %d.", c.name.EN, n)),
			S(fmt.Sprint(n)), numTexts(append([]int{n + m}, numberOptions(r, n, 3, 3)...))...)
		return Round{Question: q, Visual: Visual{Kind: "garden", Items: []Item{{Icon: "flower", Color: c.key, Count: n}, {Icon: "flower", Color: other.key, Count: m}}}}
	case 1: // first letter of a picture word
		w := pick(r, gardenWords)
		prompt := T(fmt.Sprintf("Kata \"%s\" diawali huruf apa?", w.id), fmt.Sprintf("Which letter does \"%s\" start with?", w.en))
		hint := T(fmt.Sprintf("%s diawali huruf %s.", w.id, w.id[:1]), fmt.Sprintf("%s starts with %s.", w.en, w.en[:1]))
		return Round{Question: bilingualLetter(r, "ng-first-"+w.id, w.id[:1], w.en[:1], prompt, hint), Visual: Visual{Kind: "letters", Items: []Item{{Icon: w.icon, Label: T(w.id, w.en)}}}}
	case 2: // continue the number pattern
		start, step := 1+r.IntN(10), pick(r, []int{1, 2, 5, 10})
		if grade <= 1 {
			step = pick(r, []int{1, 2})
		}
		seq := []int{start, start + step, start + 2*step, start + 3*step}
		ans := start + 4*step
		items := make([]Item, len(seq)+1)
		for i, v := range seq {
			items[i] = Item{Icon: "flower", Value: fmt.Sprint(v), Color: flowerColors[i%4].key}
		}
		items[len(seq)] = Item{Icon: "flower", Value: "?", Color: "#94a3b8"}
		q := build(r, fmt.Sprintf("ng-seq-%d-%d", start, step), "math",
			T(fmt.Sprintf("Lanjutkan pola bunga: %d, %d, %d, %d, …", seq[0], seq[1], seq[2], seq[3]), fmt.Sprintf("Continue the flower pattern: %d, %d, %d, %d, …", seq[0], seq[1], seq[2], seq[3])),
			T(fmt.Sprintf("Setiap bunga bertambah %d.", step), fmt.Sprintf("Each flower adds %d.", step)),
			S(fmt.Sprint(ans)), numTexts(append([]int{ans + step, ans - 1, ans + 1}, numberOptions(r, ans, max(step, 2)*2, 3)...))...)
		return Round{Question: q, Visual: Visual{Kind: "sequence", Items: items}}
	case 3: // missing letter
		w := pick(r, gardenWords)
		word := w.id
		if r.IntN(2) == 0 && grade >= 3 {
			word = w.en
		}
		i := r.IntN(len(word))
		missing := string(word[i])
		masked := word[:i] + "_" + word[i+1:]
		pool := []questions.Text{}
		for _, l := range "AEIOUKLMNRST" {
			pool = append(pool, S(string(l)))
		}
		r.Shuffle(len(pool), func(a, b int) { pool[a], pool[b] = pool[b], pool[a] })
		q := build(r, "ng-miss-"+word+fmt.Sprint(i), "language",
			T(fmt.Sprintf("Huruf apa yang hilang? %s", masked), fmt.Sprintf("Which letter is missing? %s", masked)),
			T(fmt.Sprintf("Kata lengkapnya %s.", word), fmt.Sprintf("The full word is %s.", word)),
			S(missing), pool...)
		tiles := []Item{}
		for _, ch := range masked {
			tiles = append(tiles, Item{Value: string(ch)})
		}
		return Round{Question: q, Visual: Visual{Kind: "tiles", Items: append([]Item{{Icon: w.icon, Label: T(w.id, w.en)}}, tiles...)}}
	case 4: // odd/even and multiples
		n := 10 + r.IntN(90)
		k := pick(r, []int{2, 3, 4, 5})
		ans := (n/k + 1) * k
		q := build(r, fmt.Sprintf("ng-mult-%d-%d", n, k), "math",
			T(fmt.Sprintf("Bilangan kelipatan %d yang paling dekat setelah %d adalah…", k, n), fmt.Sprintf("The first multiple of %d after %d is…", k, n)),
			T(fmt.Sprintf("%d × %d = %d", ans/k, k, ans), fmt.Sprintf("%d × %d = %d", ans/k, k, ans)),
			S(fmt.Sprint(ans)), numTexts([]int{ans + 1, ans - 1, ans + k, n + 1})...)
		return Round{Question: q, Visual: Visual{Kind: "sequence", Items: []Item{{Icon: "flower", Value: fmt.Sprint(n), Color: "#ffd93d"}, {Icon: "flower", Value: "?", Color: "#94a3b8"}}}}
	case 5: // alphabetical order
		ws := []string{}
		used := map[string]bool{}
		for len(ws) < 4 {
			w := pick(r, gardenWords).id
			if !used[w[:1]] {
				used[w[:1]] = true
				ws = append(ws, w)
			}
		}
		first := ws[0]
		for _, w := range ws {
			if w < first {
				first = w
			}
		}
		opts := []questions.Text{}
		for _, w := range ws {
			opts = append(opts, S(w))
		}
		q := build(r, "ng-abc-"+strings.Join(ws, "-"), "language",
			T("Kata mana yang muncul paling awal menurut abjad?", "Which word comes first in alphabetical order?"),
			T(fmt.Sprintf("%s diawali huruf %s.", first, first[:1]), fmt.Sprintf("%s starts with %s.", first, first[:1])),
			S(first), opts...)
		return Round{Question: q, Visual: Visual{Kind: "tiles", Items: []Item{{Value: "A"}, {Value: "B"}, {Value: "C"}, {Value: "…"}}}}
	case 6: // prime numbers
		primes := []int{2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47}
		p := pick(r, primes)
		comp := []int{}
		for _, c := range []int{4, 6, 8, 9, 10, 12, 14, 15, 16, 18, 20, 21, 22, 25, 27, 33, 35, 39, 49} {
			comp = append(comp, c)
		}
		r.Shuffle(len(comp), func(i, j int) { comp[i], comp[j] = comp[j], comp[i] })
		q := build(r, fmt.Sprintf("ng-prime-%d", p), "math",
			T("Manakah bilangan prima?", "Which number is prime?"),
			T(fmt.Sprintf("%d hanya habis dibagi 1 dan dirinya sendiri.", p), fmt.Sprintf("%d is only divisible by 1 and itself.", p)),
			S(fmt.Sprint(p)), numTexts(comp[:3])...)
		return Round{Question: q, Visual: Visual{Kind: "garden", Items: []Item{{Icon: "flower", Color: "#6c5ce7", Count: p % 9}}}}
	default: // count syllables / letters
		w := pick(r, gardenWords)
		n := len(w.id)
		q := build(r, "ng-len-"+w.id, "language",
			T(fmt.Sprintf("Kata \"%s\" terdiri dari berapa huruf?", w.id), fmt.Sprintf("How many letters are in the Indonesian word \"%s\"?", w.id)),
			T(fmt.Sprintf("%s = %d huruf.", w.id, n), fmt.Sprintf("%s = %d letters.", w.id, n)),
			S(fmt.Sprint(n)), numTexts(numberOptions(r, n, 2, 3))...)
		tiles := []Item{}
		for _, ch := range w.id {
			tiles = append(tiles, Item{Value: string(ch)})
		}
		return Round{Question: q, Visual: Visual{Kind: "tiles", Items: tiles}}
	}
}

// bilingualLetter asks for the first letter: Indonesian players get the
// Indonesian word, English players the English word.
func bilingualLetter(r *rand.Rand, key, id, en string, prompt, hint questions.Text) questions.Question {
	opts := []questions.Text{{ID: id, EN: en}}
	seen := map[string]bool{id: true, en: true}
	for _, l := range []string{"A", "B", "D", "K", "L", "M", "P", "S", "T", "R", "W"} {
		if len(opts) == 4 {
			break
		}
		if !seen[l] && r.IntN(2) == 0 {
			seen[l] = true
			opts = append(opts, S(l))
		}
	}
	for _, l := range []string{"G", "H", "J", "N"} {
		if len(opts) < 4 && !seen[l] {
			seen[l] = true
			opts = append(opts, S(l))
		}
	}
	r.Shuffle(len(opts), func(i, j int) { opts[i], opts[j] = opts[j], opts[i] })
	ans := 0
	for i, o := range opts {
		if o.ID == id {
			ans = i
		}
	}
	return questions.Question{Key: key, Subject: "language", Prompt: prompt, Hint: hint, Options: opts, Answer: ans}
}

// --------------------------------------------------------- Explore Indonesia

type province struct {
	name    string
	capital string
	island  questions.Text
	dance   string
	house   string
	food    string
	band    int // lowest grade band the province is asked for
}

var provinces = []province{
	{"DKI Jakarta", "Jakarta", T("Jawa", "Java"), "Tari Yapong", "Rumah Kebaya", "Kerak telor", 0},
	{"Jawa Barat", "Bandung", T("Jawa", "Java"), "Tari Jaipong", "Rumah Kasepuhan", "Surabi", 0},
	{"Jawa Tengah", "Semarang", T("Jawa", "Java"), "Tari Gambyong", "Joglo", "Lumpia", 0},
	{"DI Yogyakarta", "Yogyakarta", T("Jawa", "Java"), "Tari Serimpi", "Bangsal Kencono", "Gudeg", 0},
	{"Jawa Timur", "Surabaya", T("Jawa", "Java"), "Tari Reog", "Rumah Joglo Situbondo", "Rawon", 0},
	{"Bali", "Denpasar", T("Bali", "Bali"), "Tari Kecak", "Gapura Candi Bentar", "Ayam betutu", 0},
	{"Sumatera Barat", "Padang", T("Sumatera", "Sumatra"), "Tari Piring", "Rumah Gadang", "Rendang", 0},
	{"Sumatera Utara", "Medan", T("Sumatera", "Sumatra"), "Tari Tor-tor", "Rumah Bolon", "Bika Ambon", 1},
	{"Aceh", "Banda Aceh", T("Sumatera", "Sumatra"), "Tari Saman", "Rumoh Aceh", "Mie Aceh", 1},
	{"Sumatera Selatan", "Palembang", T("Sumatera", "Sumatra"), "Tari Tanggai", "Rumah Limas", "Pempek", 0},
	{"Kalimantan Barat", "Pontianak", T("Kalimantan", "Borneo (Kalimantan)"), "Tari Monong", "Rumah Radakng", "Bubur pedas", 2},
	{"Kalimantan Selatan", "Banjarbaru", T("Kalimantan", "Borneo (Kalimantan)"), "Tari Baksa Kembang", "Rumah Bubungan Tinggi", "Soto Banjar", 2},
	{"Kalimantan Timur", "Samarinda", T("Kalimantan", "Borneo (Kalimantan)"), "Tari Gong", "Rumah Lamin", "Nasi kuning Samarinda", 1},
	{"Sulawesi Selatan", "Makassar", T("Sulawesi", "Sulawesi"), "Tari Pakarena", "Tongkonan", "Coto Makassar", 1},
	{"Sulawesi Utara", "Manado", T("Sulawesi", "Sulawesi"), "Tari Maengket", "Rumah Walewangko", "Tinutuan", 2},
	{"Nusa Tenggara Barat", "Mataram", T("Lombok dan Sumbawa", "Lombok and Sumbawa"), "Tari Gandrung", "Dalam Loka", "Ayam taliwang", 2},
	{"Nusa Tenggara Timur", "Kupang", T("Flores, Sumba, dan Timor", "Flores, Sumba and Timor"), "Tari Caci", "Rumah Musalaki", "Se'i", 2},
	{"Maluku", "Ambon", T("Kepulauan Maluku", "Maluku Islands"), "Tari Cakalele", "Rumah Baileo", "Papeda", 1},
	{"Papua", "Jayapura", T("Papua", "Papua"), "Tari Yospan", "Honai", "Papeda", 0},
	{"Banten", "Serang", T("Jawa", "Java"), "Tari Cokek", "Rumah Baduy", "Sate bandeng", 2},
	{"Riau", "Pekanbaru", T("Sumatera", "Sumatra"), "Tari Zapin", "Rumah Selaso Jatuh Kembar", "Gulai ikan patin", 2},
	{"Lampung", "Bandar Lampung", T("Sumatera", "Sumatra"), "Tari Sigeh Pengunten", "Nuwo Sesat", "Seruit", 2},
}

var islandNames = []questions.Text{T("Jawa", "Java"), T("Sumatera", "Sumatra"), T("Kalimantan", "Borneo (Kalimantan)"), T("Sulawesi", "Sulawesi"), T("Papua", "Papua"), T("Bali", "Bali")}

func eligible(grade int) []province {
	out := []province{}
	for _, p := range provinces {
		if p.band <= questions.Band(grade) {
			out = append(out, p)
		}
	}
	return out
}

func otherValues(r *rand.Rand, list []province, skip province, get func(province) string) []questions.Text {
	out := []questions.Text{}
	seen := map[string]bool{get(skip): true}
	for _, i := range r.Perm(len(list)) {
		v := get(list[i])
		if !seen[v] {
			seen[v] = true
			out = append(out, S(v))
		}
		if len(out) == 3 {
			break
		}
	}
	return out
}

func makeExplore(grade int, r *rand.Rand) Round {
	list := eligible(grade)
	p := pick(r, list)
	pin := Visual{Kind: "map", Items: []Item{{Icon: "map-pin", Label: S(p.name)}}, Note: p.island}
	kinds := []int{0, 1}
	switch questions.Band(grade) {
	case 0:
		kinds = []int{0, 1, 3}
	case 1:
		kinds = []int{0, 1, 2, 3}
	default:
		kinds = []int{0, 2, 3, 4}
	}
	switch pick(r, kinds) {
	case 0:
		return Round{Question: build(r, "ei-cap-"+p.name, "social",
			T(fmt.Sprintf("Apa ibu kota Provinsi %s?", p.name), fmt.Sprintf("What is the capital of %s province?", p.name)),
			T(fmt.Sprintf("Ibu kota %s adalah %s.", p.name, p.capital), fmt.Sprintf("The capital of %s is %s.", p.name, p.capital)),
			S(p.capital), otherValues(r, list, p, func(o province) string { return o.capital })...), Visual: pin}
	case 1:
		wrong := []questions.Text{}
		for _, i := range r.Perm(len(islandNames)) {
			if islandNames[i].ID != p.island.ID && len(wrong) < 3 {
				wrong = append(wrong, islandNames[i])
			}
		}
		return Round{Question: build(r, "ei-isl-"+p.name, "social",
			T(fmt.Sprintf("Provinsi %s berada di pulau…", p.name), fmt.Sprintf("%s province is on…", p.name)),
			T(fmt.Sprintf("%s ada di %s.", p.name, p.island.ID), fmt.Sprintf("%s is on %s.", p.name, p.island.EN)),
			p.island, wrong...), Visual: Visual{Kind: "map", Items: []Item{{Icon: "map-pin", Label: S(p.name)}}}}
	case 2:
		return Round{Question: build(r, "ei-dance-"+p.name, "social",
			T(fmt.Sprintf("Tarian tradisional dari %s adalah…", p.name), fmt.Sprintf("A traditional dance from %s is…", p.name)),
			T(fmt.Sprintf("%s berasal dari %s.", p.dance, p.name), fmt.Sprintf("%s comes from %s.", p.dance, p.name)),
			S(p.dance), otherValues(r, list, p, func(o province) string { return o.dance })...), Visual: pin}
	case 3:
		return Round{Question: build(r, "ei-food-"+p.name, "social",
			T(fmt.Sprintf("Makanan khas %s adalah…", p.name), fmt.Sprintf("A signature dish of %s is…", p.name)),
			T(fmt.Sprintf("%s khas %s.", p.food, p.name), fmt.Sprintf("%s is typical of %s.", p.food, p.name)),
			S(p.food), otherValues(r, list, p, func(o province) string { return o.food })...), Visual: pin}
	default:
		return Round{Question: build(r, "ei-house-"+p.name, "social",
			T(fmt.Sprintf("Rumah adat dari %s adalah…", p.name), fmt.Sprintf("The traditional house of %s is…", p.name)),
			T(fmt.Sprintf("%s adalah rumah adat %s.", p.house, p.name), fmt.Sprintf("%s is the traditional house of %s.", p.house, p.name)),
			S(p.house), otherValues(r, list, p, func(o province) string { return o.house })...), Visual: pin}
	}
}

// ------------------------------------------------------------------ Mini Lab

type experiment struct {
	band    int
	icon    string
	prompt  questions.Text
	answer  questions.Text
	wrong   []questions.Text
	hint    questions.Text
	visual  []Item
	topic   string
	setup   questions.Text
	subject string
}

var experiments = []experiment{
	{0, "droplets", T("Es batu diletakkan di bawah sinar matahari. Apa yang terjadi?", "An ice cube is left in the sun. What happens?"), T("Mencair menjadi air", "It melts into water"),
		[]questions.Text{T("Menjadi batu", "It turns into stone"), T("Bertambah besar", "It grows bigger"), T("Berubah warna merah", "It turns red")},
		T("Panas membuat es (padat) menjadi cair.", "Heat turns solid ice into liquid."), []Item{{Icon: "snowflake", Label: T("Es", "Ice")}, {Icon: "sun", Label: T("Panas", "Heat")}}, "matter", T("Percobaan wujud benda", "States of matter"), "science"},
	{0, "waves", T("Benda mana yang mengapung di air?", "Which object floats on water?"), T("Daun kering", "A dry leaf"),
		[]questions.Text{T("Batu", "A stone"), T("Paku besi", "An iron nail"), T("Kelereng kaca", "A glass marble")},
		T("Daun ringan dan berongga sehingga mengapung.", "A leaf is light, so it floats."), []Item{{Icon: "waves", Label: T("Bak air", "Water tub")}}, "float", T("Tenggelam atau mengapung", "Sink or float"), "science"},
	{0, "magnet", T("Benda mana yang ditarik magnet?", "Which object does a magnet pull?"), T("Peniti besi", "An iron safety pin"),
		[]questions.Text{T("Penghapus karet", "A rubber eraser"), T("Kertas", "Paper"), T("Sendok kayu", "A wooden spoon")},
		T("Magnet menarik benda dari besi.", "Magnets attract iron."), []Item{{Icon: "magnet", Label: T("Magnet", "Magnet")}}, "magnet", T("Percobaan magnet", "Magnet test"), "science"},
	{0, "palette", T("Cat merah dicampur cat kuning menjadi warna…", "Red paint mixed with yellow paint makes…"), T("Oranye", "Orange"),
		[]questions.Text{T("Hijau", "Green"), T("Ungu", "Purple"), T("Biru", "Blue")},
		T("Merah + kuning = oranye.", "Red + yellow = orange."), []Item{{Icon: "flask", Color: "#ef4444", Label: T("Merah", "Red")}, {Icon: "flask", Color: "#facc15", Label: T("Kuning", "Yellow")}}, "color", T("Mencampur warna", "Mixing colours"), "science"},
	{0, "palette", T("Cat biru dicampur cat kuning menjadi warna…", "Blue paint mixed with yellow paint makes…"), T("Hijau", "Green"),
		[]questions.Text{T("Oranye", "Orange"), T("Merah muda", "Pink"), T("Cokelat", "Brown")},
		T("Biru + kuning = hijau.", "Blue + yellow = green."), []Item{{Icon: "flask", Color: "#3b82f6", Label: T("Biru", "Blue")}, {Icon: "flask", Color: "#facc15", Label: T("Kuning", "Yellow")}}, "color", T("Mencampur warna", "Mixing colours"), "science"},
	{0, "sprout", T("Biji kacang ditanam di kapas basah dan diletakkan di dekat jendela. Apa yang dibutuhkan agar tumbuh?", "A bean is planted on wet cotton by a window. What does it need to grow?"), T("Air dan cahaya", "Water and light"),
		[]questions.Text{T("Gula dan garam", "Sugar and salt"), T("Kegelapan total", "Total darkness"), T("Plastik", "Plastic")},
		T("Tumbuhan butuh air dan cahaya.", "Plants need water and light."), []Item{{Icon: "sprout", Label: T("Kacang", "Bean")}, {Icon: "sun", Label: T("Cahaya", "Light")}}, "plant", T("Menanam kacang", "Growing a bean"), "science"},
	{1, "thermometer", T("Air dipanaskan terus sampai mendidih. Pada suhu berapa air murni mendidih (tekanan normal)?", "Water is heated until it boils. At what temperature does pure water boil (normal pressure)?"), T("100 °C", "100 °C"),
		[]questions.Text{S("50 °C"), S("0 °C"), S("212 °C")}, T("Air mendidih pada 100 °C.", "Water boils at 100 °C."), []Item{{Icon: "flame", Label: T("Pemanas", "Burner")}, {Icon: "thermometer", Value: "?"}}, "heat", T("Memanaskan air", "Heating water"), "science"},
	{1, "lightbulb", T("Rangkaian lampu, baterai, dan kabel. Lampu menyala jika rangkaiannya…", "A bulb, battery and wires. The bulb lights when the circuit is…"), T("Tertutup", "Closed"),
		[]questions.Text{T("Terbuka", "Open"), T("Tanpa baterai", "Without a battery"), T("Basah", "Wet")},
		T("Arus listrik mengalir pada rangkaian tertutup.", "Current flows in a closed circuit."), []Item{{Icon: "battery", Label: T("Baterai", "Battery")}, {Icon: "lightbulb", Label: T("Lampu", "Bulb")}}, "circuit", T("Rangkaian listrik", "Electric circuit"), "science"},
	{1, "droplets", T("Garam diaduk ke dalam air hangat sampai tidak terlihat. Garam itu…", "Salt is stirred into warm water until it disappears. The salt has…"), T("Larut dalam air", "Dissolved in the water"),
		[]questions.Text{T("Menguap ke udara", "Evaporated into the air"), T("Berubah jadi gula", "Turned into sugar"), T("Hilang selamanya", "Vanished forever")},
		T("Garam larut; jika airnya diuapkan garam muncul lagi.", "Salt dissolves; evaporate the water and it comes back."), []Item{{Icon: "flask", Color: "#bae6fd", Label: T("Air hangat", "Warm water")}}, "solution", T("Melarutkan garam", "Dissolving salt"), "science"},
	{1, "sun", T("Bayangan sebuah tiang paling pendek terjadi pada…", "A pole's shadow is shortest at…"), T("Tengah hari", "Midday"),
		[]questions.Text{T("Pagi hari", "Early morning"), T("Sore hari", "Late afternoon"), T("Malam hari", "Night")},
		T("Saat tengah hari matahari berada paling tinggi.", "At midday the sun is highest."), []Item{{Icon: "sun", Label: T("Matahari", "Sun")}}, "light", T("Bayangan", "Shadows"), "science"},
	{2, "flask", T("Kertas lakmus biru dicelupkan ke cuka lalu berubah merah. Cuka bersifat…", "Blue litmus paper turns red in vinegar. Vinegar is…"), T("Asam", "Acidic"),
		[]questions.Text{T("Basa", "Basic"), T("Netral", "Neutral"), T("Garam", "A salt")},
		T("Asam mengubah lakmus biru menjadi merah.", "Acids turn blue litmus red."), []Item{{Icon: "flask", Color: "#f87171", Label: T("Cuka", "Vinegar")}}, "acid", T("Uji lakmus", "Litmus test"), "science"},
	{2, "scale", T("Sebuah benda bermassa 200 g dan bervolume 100 cm³. Massa jenisnya…", "An object has a mass of 200 g and a volume of 100 cm³. Its density is…"), T("2 g/cm³", "2 g/cm³"),
		[]questions.Text{S("0,5 g/cm³"), S("20 g/cm³"), S("300 g/cm³")}, T("ρ = m ÷ V = 200 ÷ 100.", "ρ = m ÷ V = 200 ÷ 100."), []Item{{Icon: "scale", Value: "200 g"}, {Icon: "box", Value: "100 cm³"}}, "density", T("Massa jenis", "Density"), "science"},
	{2, "lightbulb", T("Dua lampu dirangkai seri. Jika satu lampu putus, lampu lainnya…", "Two bulbs are in series. If one burns out, the other…"), T("Ikut padam", "Goes out too"),
		[]questions.Text{T("Makin terang", "Gets brighter"), T("Tetap menyala sama", "Stays the same"), T("Berkedip", "Flickers")},
		T("Rangkaian seri hanya punya satu jalur arus.", "A series circuit has one path for current."), []Item{{Icon: "lightbulb"}, {Icon: "lightbulb"}, {Icon: "battery"}}, "circuit", T("Rangkaian seri", "Series circuit"), "science"},
	{2, "leaf", T("Daun ditutup kertas hitam selama 2 hari lalu diuji iodin. Bagian tertutup tidak berwarna biru tua karena…", "Part of a leaf is covered for 2 days, then tested with iodine. The covered part does not turn dark blue because…"), T("Tidak terjadi fotosintesis", "No photosynthesis happened there"),
		[]questions.Text{T("Daunnya mati", "The leaf died"), T("Iodin rusak", "The iodine was broken"), T("Terlalu banyak cahaya", "Too much light")},
		T("Tanpa cahaya tidak terbentuk amilum.", "Without light no starch is made."), []Item{{Icon: "leaf", Label: T("Daun", "Leaf")}}, "plant", T("Uji amilum", "Starch test"), "science"},
	{3, "rocket", T("Roket mendorong gas ke bawah sehingga roket naik. Ini contoh Hukum Newton ke…", "A rocket pushes gas down and rises. This shows Newton's … law"), T("III (aksi-reaksi)", "Third (action–reaction)"),
		[]questions.Text{T("I (kelembaman)", "First (inertia)"), T("II (F = m·a)", "Second (F = m·a)"), T("Gravitasi", "Gravitation")},
		T("Gaya aksi dan reaksi sama besar, berlawanan arah.", "Action and reaction are equal and opposite."), []Item{{Icon: "rocket", Label: T("Roket", "Rocket")}}, "force", T("Gaya dorong", "Thrust"), "science"},
	{3, "flask", T("Larutan dengan pH 12 bersifat…", "A solution with pH 12 is…"), T("Basa kuat", "Strongly basic"),
		[]questions.Text{T("Asam kuat", "Strongly acidic"), T("Netral", "Neutral"), T("Asam lemah", "Weakly acidic")},
		T("pH > 7 basa; makin besar makin kuat.", "pH above 7 is basic."), []Item{{Icon: "flask", Color: "#818cf8", Value: "pH 12"}}, "acid", T("Skala pH", "pH scale"), "science"},
	{3, "zap", T("Hambatan 6 Ω dialiri arus 2 A. Tegangannya…", "A 6 Ω resistor carries 2 A. The voltage is…"), T("12 V", "12 V"),
		[]questions.Text{S("3 V"), S("8 V"), S("4 V")}, T("V = I × R = 2 × 6.", "V = I × R = 2 × 6."), []Item{{Icon: "zap", Value: "2 A"}, {Icon: "box", Value: "6 Ω"}}, "circuit", T("Hukum Ohm", "Ohm's law"), "science"},
	{3, "atom", T("Reaksi yang melepaskan kalor ke lingkungan disebut reaksi…", "A reaction that releases heat to its surroundings is…"), T("Eksoterm", "Exothermic"),
		[]questions.Text{T("Endoterm", "Endothermic"), T("Netralisasi", "Neutralisation"), T("Elektrolisis", "Electrolysis")},
		T("Ekso = keluar: kalor dilepas.", "Exo = out: heat is released."), []Item{{Icon: "flame"}, {Icon: "thermometer", Value: "↑"}}, "heat", T("Termokimia", "Thermochemistry"), "science"},
}

func makeLab(grade int, r *rand.Rand) Round {
	band := questions.Band(grade)
	list := []experiment{}
	for _, e := range experiments {
		if e.band == band || (e.band == band-1 && r.IntN(3) == 0) {
			list = append(list, e)
		}
	}
	if len(list) == 0 {
		list = experiments[:6]
	}
	e := pick(r, list)
	q := build(r, fmt.Sprintf("ml-%s-%d", e.topic, e.band), e.subject, e.prompt, e.hint, e.answer, e.wrong...)
	return Round{Question: q, Visual: Visual{Kind: "lab", Items: e.visual, Note: e.setup}}
}

// ------------------------------------------------------------------ Catalog

// Specs of the four games, keyed by game key.
var Specs = map[string]Spec{
	"market-math": {Key: "market-math", Prefix: "mm", Make: makeMarket, BankSubjects: []string{"math"}, BankShare: 5,
		RoundTime: byBand(30*time.Second, 25*time.Second, 22*time.Second, 20*time.Second)},
	"number-garden": {Key: "number-garden", Prefix: "ng", Make: makeGarden, BankSubjects: []string{"math", "language"}, BankShare: 6,
		RoundTime: byBand(25*time.Second, 20*time.Second, 18*time.Second, 15*time.Second)},
	"explore-indonesia": {Key: "explore-indonesia", Prefix: "ei", Make: makeExplore, BankSubjects: []string{"social", "civics"}, BankShare: 4,
		RoundTime: byBand(25*time.Second, 20*time.Second, 18*time.Second, 15*time.Second)},
	"mini-lab": {Key: "mini-lab", Prefix: "ml", Make: makeLab, BankSubjects: []string{"science"}, BankShare: 4,
		RoundTime: byBand(30*time.Second, 25*time.Second, 22*time.Second, 20*time.Second)},
}

// Keys lists the game keys in catalog order.
var Keys = []string{"market-math", "number-garden", "explore-indonesia", "mini-lab"}
