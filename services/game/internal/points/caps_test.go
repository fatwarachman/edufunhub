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
		"market-math":        {Cap(8), 950},
		"number-garden":      {Cap(8), 950},
		"explore-indonesia":  {Cap(8), 950},
		"mini-lab":           {Cap(8), 950},
		"floor-drop":         {Cap(20), 2150},
	}
	for game, c := range cases {
		if c[0] != c[1] {
			t.Errorf("%s cap %d, Laravel expects %d", game, c[0], c[1])
		}
	}
}
