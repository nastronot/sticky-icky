import base64
import time

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

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

PRINTER_PATH = "/dev/usb/lp0"


class PrintRequest(BaseModel):
    bitmap: str  # base64-encoded 1bpp row-major bitmap
    width: int   # pixel width (padded to multiple of 8)
    height: int  # pixel height
    labelW: int  # label width in dots
    labelH: int  # label height in dots


def bitmap_to_lo_commands(bitmap_bytes: bytes, width: int, height: int) -> list[str]:
    """Scan a 1bpp row-major bitmap and emit LO commands for each contiguous run of black pixels."""
    width_bytes = width // 8
    commands = []

    for y in range(height):
        row_offset = y * width_bytes
        run_start = None

        for byte_idx in range(width_bytes):
            byte_val = bitmap_bytes[row_offset + byte_idx]
            for bit in range(8):
                x = byte_idx * 8 + bit
                is_black = (byte_val >> (7 - bit)) & 1

                if is_black:
                    if run_start is None:
                        run_start = x
                else:
                    if run_start is not None:
                        run_length = x - run_start
                        commands.append(f"LO{run_start},{y},{run_length},1")
                        run_start = None

        # Close any run that extends to the end of the row
        if run_start is not None:
            run_length = width - run_start
            commands.append(f"LO{run_start},{y},{run_length},1")

    return commands


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/print")
async def print_label(req: PrintRequest):
    try:
        bitmap_bytes = base64.b64decode(req.bitmap)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid base64 bitmap data")

    expected_size = (req.width // 8) * req.height
    if len(bitmap_bytes) != expected_size:
        raise HTTPException(
            status_code=400,
            detail=f"Bitmap size mismatch: got {len(bitmap_bytes)}, expected {expected_size}",
        )

    lo_commands = bitmap_to_lo_commands(bitmap_bytes, req.width, req.height)

    epl2_lines = [
        "N",
        f"q{req.labelW}",
        f"Q{req.labelH},25",
        "D15",
        "S2",
        *lo_commands,
        "P1",
    ]
    payload_bytes = ("\r\n".join(epl2_lines) + "\r\n").encode("ascii")
    print(f"Generated {len(lo_commands)} LO commands, {len(payload_bytes)} bytes")

    try:
        with open(PRINTER_PATH, "wb") as printer:
            for offset in range(0, len(payload_bytes), 1024):
                printer.write(payload_bytes[offset:offset + 1024])
                printer.flush()
                time.sleep(0.01)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    return {"status": "ok", "lo_commands": len(lo_commands)}
