from fastapi import FastAPI

app = FastAPI()


@app.post("/print")
async def print_label():
    return {"status": "ok"}
