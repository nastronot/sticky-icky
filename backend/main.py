from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware

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


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/print")
async def print_label(request: Request):
    data = await request.body()
    try:
        with open(PRINTER_PATH, "wb") as printer:
            printer.write(data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return {"status": "ok"}
