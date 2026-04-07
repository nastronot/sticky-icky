import base64
import time

import serial
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:4173",
        "http://localhost:3000",
    ],
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)

SERIAL_PORT = "/dev/ttyUSB0"
BAUD_RATE = 38400


class PrintRequest(BaseModel):
    bitmap: str  # base64-encoded 1bpp row-major bitmap
    width: int   # pixel width (padded to multiple of 8)
    height: int  # pixel height
    labelW: int  # label width in dots
    labelH: int  # label height in dots
    darkness: int = Field(default=12, ge=0, le=15)  # EPL2 D command (0–15)
    speed: int = Field(default=1, ge=1, le=4)       # EPL2 S command (1–4)


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/print")
async def print_label(req: PrintRequest):
    try:
        bitmap_bytes = base64.b64decode(req.bitmap)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid base64 bitmap data")

    width_bytes = req.width // 8
    expected_size = width_bytes * req.height
    if len(bitmap_bytes) != expected_size:
        raise HTTPException(
            status_code=400,
            detail=f"Bitmap size mismatch: got {len(bitmap_bytes)}, expected {expected_size}",
        )

    # GW expects 0=black, 1=white. Frontend packs 1=black, 0=white. Invert.
    inverted = bytes(b ^ 0xFF for b in bitmap_bytes)

    header = (
        "\r\n"
        "N\r\n"
        f"q{req.labelW}\r\n"
        f"Q{req.labelH},21\r\n"
        f"D{req.darkness}\r\n"
        f"S{req.speed}\r\n"
        f"GW0,0,{width_bytes},{req.height}\r\n"
    ).encode("ascii")
    footer = b"P1\r\n"
    payload_bytes = header + inverted + footer

    print(
        f"Print: {req.width}x{req.height}px ({width_bytes}x{req.height} bytes), "
        f"label {req.labelW}x{req.labelH}, D{req.darkness} S{req.speed}, "
        f"payload {len(payload_bytes)} bytes"
    )

    # Debug dump (now contains binary GW data)
    with open("/tmp/last_print.epl", "wb") as f:
        f.write(payload_bytes)

    try:
        print("Opening serial port...")
        with serial.Serial(
            SERIAL_PORT,
            baudrate=BAUD_RATE,
            bytesize=serial.EIGHTBITS,
            parity=serial.PARITY_NONE,
            stopbits=serial.STOPBITS_ONE,
            timeout=2,
        ) as ser:
            ser.write(payload_bytes)
            print(f"Wrote {len(payload_bytes)} bytes to serial")
            ser.flush()
            print("Flushed")
            drain_wait = len(payload_bytes) * 10 / BAUD_RATE + 1
            time.sleep(drain_wait)
        print("Serial port closed")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    return {"status": "ok", "bytes": len(payload_bytes)}
