from pathlib import Path

import yaml

WORKFLOWS = Path(__file__).resolve().parents[1] / ".github" / "workflows"


def workflow(name: str) -> dict:
    return yaml.load((WORKFLOWS / name).read_text(), Loader=yaml.BaseLoader)


def test_publishing_and_indexing_can_finish_independently():
    notes = workflow("build.yml")
    pages = workflow("pages.yml")
    index = workflow("chat-index.yml")
    for consumer in (pages, index):
        trigger = consumer["on"]["workflow_run"]
        assert trigger["workflows"] == [notes["name"]]
        assert trigger["types"] == ["completed"]
        assert trigger["branches"] == ["main"]
    assert "chat-index" not in notes["jobs"]
    assert "success" in index["jobs"]["chat-index"]["if"]
    assert "head_repository.full_name" in index["jobs"]["chat-index"]["if"]


def test_production_d1_writers_wait_in_the_same_queue():
    index = workflow("chat-index.yml")["jobs"]["chat-index"]
    deploy = workflow("backend.yml")["jobs"]["deploy"]
    for job in (index, deploy):
        assert job["concurrency"] == {
            "group": "cloudflare-d1",
            "queue": "max",
            "cancel-in-progress": "false",
        }
