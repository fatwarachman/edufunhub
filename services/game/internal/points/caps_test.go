package points

import "testing"

// Laravel's StoreGameResultRequest::GAMES uses these caps; keep them equal.
func TestCapsMatchLaravel(t *testing.T) {
	cases := map[string][2]int{
		"flag-quest":         {3*40 + 30 + Cap(30), 3300},
		"sky-quiz":           {Cap(10) + 40, 1190},
		"quiz-duel":          {Cap(5), 650},
		"knowledge-train":    {Cap(10) + 40, 1190},
		"snakes-and-ladders": {Cap(30), 3150},
		"crossword":          {Cap(11) + 5*11*3, 1415},
	}
	for game, c := range cases {
		if c[0] != c[1] {
			t.Errorf("%s cap %d, Laravel expects %d", game, c[0], c[1])
		}
	}
}
