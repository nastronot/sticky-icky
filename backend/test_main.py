"""Tests for the FastAPI print endpoint.

The serial.Serial class is monkey-patched with an in-memory mock so the tests
can exercise the request/response path and inspect the EPL2 bytes that would
have been written to /dev/ttyUSB0 without needing a real printer attached.
"""

import base64

import pytest
from fastapi.testclient import TestClient

import main


class MockSerial:
    """Stand-in for serial.Serial that captures writes instead of touching
    /dev/ttyUSB0. Records every constructed instance on the class so tests
    can assert on what was sent."""

    instances = []

    def __init__(self, *args, **kwargs):
        self.args = args
        self.kwargs = kwargs
        self.written = bytearray()
        self.flushed = False
        MockSerial.instances.append(self)

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def write(self, data):
        self.written.extend(data)

    def flush(self):
        self.flushed = True


@pytest.fixture
def client(monkeypatch):
    MockSerial.instances.clear()
    monkeypatch.setattr(main.serial, "Serial", MockSerial)
    # time.sleep would otherwise add a real-world delay (drain wait); short it
    # so the test suite stays fast.
    monkeypatch.setattr(main.time, "sleep", lambda *_: None)
    return TestClient(main.app)


def make_bitmap_b64(width, height, fill_byte=0xFF):
    """Build a base64-encoded 1bpp row-major bitmap of the given size."""
    width_bytes = width // 8
    return base64.b64encode(bytes([fill_byte]) * (width_bytes * height)).decode()


# ── /health ────────────────────────────────────────────────────────────────


def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


# ── /print success path ────────────────────────────────────────────────────


def test_print_minimal_valid(client):
    r = client.post("/print", json={
        "bitmap": make_bitmap_b64(8, 1),
        "width": 8,
        "height": 1,
        "labelW": 100,
        "labelH": 50,
    })
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "ok"
    assert body["bytes"] > 0
    assert len(MockSerial.instances) == 1
    assert MockSerial.instances[0].flushed is True


def test_print_writes_expected_epl2_structure(client):
    bitmap = make_bitmap_b64(16, 2, fill_byte=0xFF)
    r = client.post("/print", json={
        "bitmap": bitmap,
        "width": 16,
        "height": 2,
        "labelW": 200,
        "labelH": 100,
        "darkness": 12,
        "speed": 1,
        "copies": 3,
    })
    assert r.status_code == 200
    sent = bytes(MockSerial.instances[0].written)
    # Header commands. Use the actual values the request supplied so a
    # change to the EPL2 layout is caught here.
    assert sent.startswith(b"\r\nN\r\nq16\r\nQ100,21\r\nD12\r\nS1\r\nGW10,0,2,2\r\n")
    # Footer with copies count
    assert sent.endswith(b"P3\r\n")
    # Bitmap data is the input XORed with 0xFF (frontend sends 1=black,
    # GW expects 0=black, backend inverts). 0xFF input → 0x00 in payload.
    # 4 bytes total (16 dots / 8 = 2 bytes wide × 2 rows tall).
    header_end = sent.index(b"GW10,0,2,2\r\n") + len(b"GW10,0,2,2\r\n")
    footer_start = sent.index(b"P3\r\n")
    bitmap_part = sent[header_end:footer_start]
    assert bitmap_part == b"\x00\x00\x00\x00"


def test_print_inverts_white_input(client):
    # All-white input (0x00) should be inverted to all-black on the wire (0xFF).
    bitmap = make_bitmap_b64(8, 1, fill_byte=0x00)
    r = client.post("/print", json={
        "bitmap": bitmap, "width": 8, "height": 1, "labelW": 100, "labelH": 50,
    })
    assert r.status_code == 200
    sent = bytes(MockSerial.instances[0].written)
    header_end = sent.index(b"GW10,0,1,1\r\n") + len(b"GW10,0,1,1\r\n")
    footer_start = sent.index(b"P1\r\n")
    assert sent[header_end:footer_start] == b"\xff"


def test_print_default_darkness_speed_copies(client):
    r = client.post("/print", json={
        "bitmap": make_bitmap_b64(8, 1),
        "width": 8, "height": 1, "labelW": 100, "labelH": 50,
    })
    assert r.status_code == 200
    sent = bytes(MockSerial.instances[0].written)
    # Defaults are darkness=12, speed=1, copies=1.
    assert b"D12\r\n" in sent
    assert b"S1\r\n" in sent
    assert sent.endswith(b"P1\r\n")


# ── /print 400 (handler-level validation) ───────────────────────────────────


def test_print_invalid_base64(client):
    r = client.post("/print", json={
        "bitmap": "not!valid!base64!@#$",
        "width": 8, "height": 1, "labelW": 100, "labelH": 50,
    })
    assert r.status_code == 400
    assert "base64" in r.json()["detail"].lower()


def test_print_width_not_multiple_of_8(client):
    r = client.post("/print", json={
        "bitmap": make_bitmap_b64(8, 1),
        "width": 9,  # ge=8 passes pydantic but fails the % 8 check
        "height": 1, "labelW": 100, "labelH": 50,
    })
    assert r.status_code == 400
    assert "multiple of 8" in r.json()["detail"]


def test_print_bitmap_size_mismatch(client):
    # Send 8x1 bitmap (1 byte) but claim it's 16x1 (should be 2 bytes)
    r = client.post("/print", json={
        "bitmap": make_bitmap_b64(8, 1),
        "width": 16, "height": 1, "labelW": 100, "labelH": 50,
    })
    assert r.status_code == 400
    assert "mismatch" in r.json()["detail"].lower()


# ── /print 422 (pydantic field-level validation) ────────────────────────────


def test_print_width_below_minimum(client):
    r = client.post("/print", json={
        "bitmap": make_bitmap_b64(8, 1),
        "width": 0, "height": 1, "labelW": 100, "labelH": 50,
    })
    assert r.status_code == 422


def test_print_width_above_maximum(client):
    r = client.post("/print", json={
        "bitmap": make_bitmap_b64(8, 1),
        "width": 5000, "height": 1, "labelW": 100, "labelH": 50,
    })
    assert r.status_code == 422


def test_print_height_above_maximum(client):
    r = client.post("/print", json={
        "bitmap": make_bitmap_b64(8, 1),
        "width": 8, "height": 5000, "labelW": 100, "labelH": 50,
    })
    assert r.status_code == 422


@pytest.mark.parametrize("darkness", [-1, 16])
def test_print_darkness_out_of_range(client, darkness):
    r = client.post("/print", json={
        "bitmap": make_bitmap_b64(8, 1),
        "width": 8, "height": 1, "labelW": 100, "labelH": 50,
        "darkness": darkness,
    })
    assert r.status_code == 422


@pytest.mark.parametrize("speed", [0, 5])
def test_print_speed_out_of_range(client, speed):
    r = client.post("/print", json={
        "bitmap": make_bitmap_b64(8, 1),
        "width": 8, "height": 1, "labelW": 100, "labelH": 50,
        "speed": speed,
    })
    assert r.status_code == 422


@pytest.mark.parametrize("copies", [0, 100])
def test_print_copies_out_of_range(client, copies):
    r = client.post("/print", json={
        "bitmap": make_bitmap_b64(8, 1),
        "width": 8, "height": 1, "labelW": 100, "labelH": 50,
        "copies": copies,
    })
    assert r.status_code == 422


def test_print_missing_field(client):
    r = client.post("/print", json={
        "bitmap": make_bitmap_b64(8, 1),
        "width": 8, "height": 1,
        # missing labelW, labelH
    })
    assert r.status_code == 422


def test_print_bitmap_too_long(client):
    # Exceeds the 4 MB max_length cap on the bitmap field.
    huge = "A" * (main.MAX_BITMAP_BASE64 + 1)
    r = client.post("/print", json={
        "bitmap": huge, "width": 8, "height": 1, "labelW": 100, "labelH": 50,
    })
    assert r.status_code == 422


# ── /print 500 (serial errors) ──────────────────────────────────────────────


def test_print_serial_error(client, monkeypatch):
    class BoomSerial(MockSerial):
        def __init__(self, *args, **kwargs):
            raise OSError("device busy")

    monkeypatch.setattr(main.serial, "Serial", BoomSerial)
    r = client.post("/print", json={
        "bitmap": make_bitmap_b64(8, 1),
        "width": 8, "height": 1, "labelW": 100, "labelH": 50,
    })
    assert r.status_code == 500
    assert "device busy" in r.json()["detail"]
