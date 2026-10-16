package questions

import "testing"

func TestClassroomDifficultyFiltersPickedQuestions(t *testing.T) {
	bank, err := Parse([]byte(`{"version":"difficulty","questions":[
		{"key":"easy","type":"choice","band":1,"level":1,"subject":"science","prompt":{"id":"Easy"},"options":[{"id":"a"},{"id":"b"},{"id":"c"}],"answer":0,"games":["sky-quiz"]},
		{"key":"hard","type":"choice","band":1,"level":3,"subject":"science","prompt":{"id":"Hard"},"options":[{"id":"a"},{"id":"b"},{"id":"c"}],"answer":0,"games":["sky-quiz"]}
	]}`))
	if err != nil {
		t.Fatal(err)
	}
	Use(bank)
	t.Cleanup(func() { Use(nil) })
	bank.classrooms = map[int64]map[string]classroomGame{
		42: {"sky-quiz": {difficulty: 3, items: bank.items}},
	}

	q := NewFor("sky-quiz", 5, 1).For("science").InClassroom(42).Choice()
	if q.Key != "hard" || q.Level != 3 {
		t.Fatalf("classroom difficulty did not select hard question: %+v", q)
	}
}

func TestClassroomDifficultyKeepsNearestAvailableLevel(t *testing.T) {
	bank, err := Parse([]byte(`{"version":"difficulty","questions":[
		{"key":"easy","type":"choice","band":1,"level":1,"subject":"science","prompt":{"id":"Easy"},"options":[{"id":"a"},{"id":"b"},{"id":"c"}],"answer":0,"games":["sky-quiz"]}
	]}`))
	if err != nil {
		t.Fatal(err)
	}
	Use(bank)
	t.Cleanup(func() { Use(nil) })
	bank.classrooms = map[int64]map[string]classroomGame{
		42: {"sky-quiz": {difficulty: 3, items: bank.items}},
	}

	q := NewFor("sky-quiz", 5, 1).InClassroom(42).Choice()
	if q.Key != "easy" || q.Level != 1 {
		t.Fatalf("nearest classroom question mismatch: %+v", q)
	}
}
