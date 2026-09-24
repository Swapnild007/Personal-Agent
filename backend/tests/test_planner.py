from agent.planner import Planner


def test_planner_builds_stable_system_and_user_messages() -> None:
    planner = Planner()
    messages = planner.messages("Fix the failing tests.")

    assert messages[0]["role"] == "system"
    assert "never claim success" in messages[0]["content"]
    assert messages[1] == {
        "role": "user",
        "content": "Fix the failing tests.",
    }
