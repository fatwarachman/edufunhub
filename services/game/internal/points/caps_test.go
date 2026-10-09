package points

import "testing"

// Laravel's StoreGameResultRequest::GAMES uses these caps; keep them equal.
func TestCapsMatchLaravel(t *testing.T) {
	cases := map[string][2]int{
		"flag-quest":         {3*40 + 30 + Cap(30), 9300},
		"sky-quiz":           {Cap(10) + 40, 3190},
		"quiz-duel":          {Cap(5), 1650},
		"knowledge-train":    {Cap(10) + 40, 3190},
		"snakes-and-ladders": {Cap(30) + 100, 9250},
		"crossword":          {Cap(11) + 5*11*3, 3615},
		"market-math":        {Cap(8), 2550},
		"number-garden":      {Cap(8), 2550},
		"explore-indonesia":  {Cap(8), 2550},
		"mini-lab":           {Cap(8), 2550},
		"floor-drop":         {Cap(60), 18150},
		"economy-heist":      {Cap(40), 12150},
		"order-rush":         {Cap(40), 12150},
		"port-sorter":        {Cap(30) + 40, 9190},
		"turbo-trivia":       {Cap(15), 4650},
		"block-battle":       {Cap(40), 12150},
		"monster-cafe":       {Cap(40), 12150},
		"ping-pong":          {Cap(60), 18150},
	}
	for game, c := range cases {
		if c[0] != c[1] {
			t.Errorf("%s cap %d, Laravel expects %d", game, c[0], c[1])
		}
	}
}
