"""
High School Management System API

A super simple FastAPI application that allows students to view and sign up
for extracurricular activities at Mergington High School.
"""

from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import RedirectResponse
import os
import json
import uuid
import hmac
import hashlib
import time
from pathlib import Path
from pydantic import BaseModel
from fastapi import Header

app = FastAPI(title="Mergington High School API",
              description="API for viewing and signing up for extracurricular activities")


class AdminLoginRequest(BaseModel):
    username: str
    password: str

# Mount the static files directory
current_dir = Path(__file__).parent
app.mount("/static", StaticFiles(directory=os.path.join(Path(__file__).parent,
          "static")), name="static")

ADMIN_TOKEN_TTL_SECONDS = int(os.getenv("ADMIN_TOKEN_TTL_SECONDS", "3600"))


def load_teacher_credentials() -> dict[str, str]:
    """Load teacher credentials from env JSON or a local JSON file."""
    env_json = os.getenv("TEACHER_CREDENTIALS_JSON")

    if env_json:
        try:
            payload = json.loads(env_json)
        except json.JSONDecodeError as exc:
            raise RuntimeError(
                "Invalid TEACHER_CREDENTIALS_JSON value: expected valid JSON"
            ) from exc

        return payload.get("teachers", {})

    teachers_file = current_dir / "teachers.json"

    if not teachers_file.exists():
        return {}

    try:
        with open(teachers_file, "r", encoding="utf-8") as fp:
            payload = json.load(fp)
    except (OSError, json.JSONDecodeError) as exc:
        raise RuntimeError(
            f"Failed to load teacher credentials from {teachers_file}"
        ) from exc

    return payload.get("teachers", {})


def verify_password(stored_password: str, provided_password: str) -> bool:
    """Support either plaintext (demo) or sha256$<hex> credential format."""
    if stored_password.startswith("sha256$"):
        expected_hash = stored_password.split("$", 1)[1]
        actual_hash = hashlib.sha256(provided_password.encode("utf-8")).hexdigest()
        return hmac.compare_digest(expected_hash, actual_hash)

    return hmac.compare_digest(stored_password, provided_password)


def cleanup_expired_tokens() -> None:
    now = time.time()
    expired_tokens = [
        token for token, expires_at in active_admin_tokens.items()
        if expires_at <= now
    ]

    for token in expired_tokens:
        del active_admin_tokens[token]


teacher_credentials = load_teacher_credentials()
active_admin_tokens: dict[str, float] = {}

# In-memory activity database
activities = {
    "Chess Club": {
        "description": "Learn strategies and compete in chess tournaments",
        "schedule": "Fridays, 3:30 PM - 5:00 PM",
        "max_participants": 12,
        "participants": ["michael@mergington.edu", "daniel@mergington.edu"]
    },
    "Programming Class": {
        "description": "Learn programming fundamentals and build software projects",
        "schedule": "Tuesdays and Thursdays, 3:30 PM - 4:30 PM",
        "max_participants": 20,
        "participants": ["emma@mergington.edu", "sophia@mergington.edu"]
    },
    "Gym Class": {
        "description": "Physical education and sports activities",
        "schedule": "Mondays, Wednesdays, Fridays, 2:00 PM - 3:00 PM",
        "max_participants": 30,
        "participants": ["john@mergington.edu", "olivia@mergington.edu"]
    },
    "Soccer Team": {
        "description": "Join the school soccer team and compete in matches",
        "schedule": "Tuesdays and Thursdays, 4:00 PM - 5:30 PM",
        "max_participants": 22,
        "participants": ["liam@mergington.edu", "noah@mergington.edu"]
    },
    "Basketball Team": {
        "description": "Practice and play basketball with the school team",
        "schedule": "Wednesdays and Fridays, 3:30 PM - 5:00 PM",
        "max_participants": 15,
        "participants": ["ava@mergington.edu", "mia@mergington.edu"]
    },
    "Art Club": {
        "description": "Explore your creativity through painting and drawing",
        "schedule": "Thursdays, 3:30 PM - 5:00 PM",
        "max_participants": 15,
        "participants": ["amelia@mergington.edu", "harper@mergington.edu"]
    },
    "Drama Club": {
        "description": "Act, direct, and produce plays and performances",
        "schedule": "Mondays and Wednesdays, 4:00 PM - 5:30 PM",
        "max_participants": 20,
        "participants": ["ella@mergington.edu", "scarlett@mergington.edu"]
    },
    "Math Club": {
        "description": "Solve challenging problems and participate in math competitions",
        "schedule": "Tuesdays, 3:30 PM - 4:30 PM",
        "max_participants": 10,
        "participants": ["james@mergington.edu", "benjamin@mergington.edu"]
    },
    "Debate Team": {
        "description": "Develop public speaking and argumentation skills",
        "schedule": "Fridays, 4:00 PM - 5:30 PM",
        "max_participants": 12,
        "participants": ["charlotte@mergington.edu", "henry@mergington.edu"]
    }
}


@app.get("/")
def root():
    return RedirectResponse(url="/static/index.html")


@app.get("/activities")
def get_activities():
    return activities


@app.post("/admin/login")
def admin_login(request: AdminLoginRequest):
    """Authenticate a teacher and return a temporary admin token."""
    cleanup_expired_tokens()
    valid_password = teacher_credentials.get(request.username)

    if valid_password is None or not verify_password(valid_password, request.password):
        raise HTTPException(status_code=401, detail="Invalid username or password")

    token = str(uuid.uuid4())
    expires_at = time.time() + ADMIN_TOKEN_TTL_SECONDS
    active_admin_tokens[token] = expires_at

    return {
        "message": "Login successful",
        "token": token,
        "username": request.username,
        "expires_in_seconds": ADMIN_TOKEN_TTL_SECONDS
    }


def verify_admin_token(token: str | None):
    cleanup_expired_tokens()

    if token is None or token not in active_admin_tokens:
        raise HTTPException(
            status_code=403,
            detail="Admin privileges required"
        )

    if active_admin_tokens[token] <= time.time():
        del active_admin_tokens[token]
        raise HTTPException(
            status_code=403,
            detail="Admin token expired"
        )


@app.post("/activities/{activity_name}/signup")
def signup_for_activity(
    activity_name: str,
    email: str,
    x_admin_token: str | None = Header(default=None, alias="X-Admin-Token")
):
    """Sign up a student for an activity"""
    verify_admin_token(x_admin_token)

    # Validate activity exists
    if activity_name not in activities:
        raise HTTPException(status_code=404, detail="Activity not found")

    # Get the specific activity
    activity = activities[activity_name]

    # Validate student is not already signed up
    if email in activity["participants"]:
        raise HTTPException(
            status_code=400,
            detail="Student is already signed up"
        )

    # Add student
    activity["participants"].append(email)
    return {"message": f"Signed up {email} for {activity_name}"}


@app.delete("/activities/{activity_name}/unregister")
def unregister_from_activity(
    activity_name: str,
    email: str,
    x_admin_token: str | None = Header(default=None, alias="X-Admin-Token")
):
    """Unregister a student from an activity"""
    verify_admin_token(x_admin_token)

    # Validate activity exists
    if activity_name not in activities:
        raise HTTPException(status_code=404, detail="Activity not found")

    # Get the specific activity
    activity = activities[activity_name]

    # Validate student is signed up
    if email not in activity["participants"]:
        raise HTTPException(
            status_code=400,
            detail="Student is not signed up for this activity"
        )

    # Remove student
    activity["participants"].remove(email)
    return {"message": f"Unregistered {email} from {activity_name}"}
