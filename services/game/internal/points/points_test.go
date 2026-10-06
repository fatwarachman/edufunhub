package points

import "testing"

func TestEveryPlayedGamePays(t *testing.T) {
	p := Defaults.Participation
	if Finished(0, 100) != p {
		t.Fatal("a finished game with nothing achieved still pays participation")
	}
	if Finished(500, 100) != 100 {
		t.Fatal("awards are capped")
	}
	if Abandoned(0, MinAnswersForAbandon-1, 100) != 0 {
		t.Fatal("leaving before achieving anything pays nothing")
	}
	if Abandoned(20, 1, 100) != 20 || Abandoned(500, 1, 100) != 100 {
		t.Fatal("leaving early keeps what was achieved, without participation")
	}
	if Abandoned(20, MinAnswersForAbandon, 100) != p+20 {
		t.Fatal("leaving after playing pays participation and achievements")
	}
}

func TestGuideRules(t *testing.T) {
	defer Use(nil)
	if Question(0) != 10 || Question(30) != 30 || Question(1000) != MaxPerQuestion {
		t.Fatal("normal question is worth 10, bonus questions their own value (capped)")
	}
	if Outcome(30, false, true) != 30 {
		t.Fatal("a draw adds nothing by default")
	}
	if Outcome(30, true, false) != 50 || Outcome(30, false, false) != 30 {
		t.Fatal("win bonus only for the winner; a loss keeps what was earned")
	}
	Use(&Rules{PerCorrect: 0, Win: 999, Draw: 5, Participation: -3})
	if r := Current(); r.PerCorrect != 1 || r.Win != MaxBonus || r.Draw != 5 || r.Participation != 0 {
		t.Fatalf("rules must be clamped: %+v", r)
	}
	if Question(0) != 1 || Outcome(10, false, true) != 15 {
		t.Fatal("admin rules apply")
	}
}
