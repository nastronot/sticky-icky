import base64
import os
import re
import time

import serial
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from starlette.responses import JSONResponse

limiter = Limiter(key_func=get_remote_address)
app = FastAPI()
app.state.limiter = limiter


@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(request: Request, exc: RateLimitExceeded):
    return JSONResponse(status_code=429, content={"detail": "Rate limit exceeded"})


_default_origins = "http://localhost:5173,http://localhost:4173,http://localhost:3000"
_cors_origins = [
    o.strip()
    for o in os.environ.get("CORS_ORIGINS", _default_origins).split(",")
    if o.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)

_serial_port = os.environ.get("SERIAL_PORT", "/dev/ttyUSB0")
if not re.match(r"^/dev/tty[A-Za-z0-9_]+$", _serial_port):
    raise ValueError(f"Invalid SERIAL_PORT: {_serial_port}")
SERIAL_PORT = _serial_port
BAUD_RATE = 38400

MAX_DOTS = 4096
MAX_BITMAP_BASE64 = 1024 * 1024  # 1 MB


class PrintRequest(BaseModel):
    bitmap: str = Field(..., max_length=MAX_BITMAP_BASE64)
    width: int = Field(..., ge=8, le=MAX_DOTS)   # padded pixel width, multiple of 8
    height: int = Field(..., ge=1, le=MAX_DOTS)  # pixel height
    labelW: int = Field(..., ge=1, le=MAX_DOTS)  # label width in dots
    labelH: int = Field(..., ge=1, le=MAX_DOTS)  # label height in dots
    darkness: int = Field(default=12, ge=0, le=15)  # EPL2 D command (0–15)
    speed: int = Field(default=1, ge=1, le=4)       # EPL2 S command (1–4)
    copies: int = Field(default=1, ge=1, le=99)     # EPL2 P command (1–99)


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/print")
@limiter.limit("10/minute")
async def print_label(request: Request, req: PrintRequest):
    if req.width % 8 != 0:
        raise HTTPException(
            status_code=400,
            detail="width must be a multiple of 8 (the bitmap is packed 1bpp row-major)",
        )

    try:
        bitmap_bytes = base64.b64decode(req.bitmap, validate=True)
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
        f"q{req.width}\r\n"
        f"Q{req.labelH},21\r\n"
        f"D{req.darkness}\r\n"
        f"S{req.speed}\r\n"
        f"GW10,0,{width_bytes},{req.height}\r\n"
    ).encode("ascii")
    footer = f"P{req.copies}\r\n".encode("ascii")
    payload_bytes = header + inverted + footer

    try:
        with serial.Serial(
            SERIAL_PORT,
            baudrate=BAUD_RATE,
            bytesize=serial.EIGHTBITS,
            parity=serial.PARITY_NONE,
            stopbits=serial.STOPBITS_ONE,
            timeout=2,
            rtscts=True,
        ) as ser:
            ser.write(payload_bytes)
            ser.flush()
            # Wait for the UART to drain (10 bits per byte for 8N1) before
            # the with-block closes the port. Otherwise the bottom of large
            # bitmaps gets cut off.
            time.sleep(len(payload_bytes) * 10 / BAUD_RATE + 1)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    return {"status": "ok", "bytes": len(payload_bytes)}
