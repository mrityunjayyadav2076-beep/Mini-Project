import os
from datetime import date
from typing import Literal

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from openai import OpenAI
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from database import (
    FocusSession,
    Subject,
    Task,
    create_tables,
    get_db,
)

load_dotenv()

app = FastAPI(
    title="AI Smart Study Planner API",
    description="Backend API for study planning and productivity.",
    version="1.0.0",
)

# Allow the frontend development server to connect.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:5500",
        "http://localhost:5500",
        "http://127.0.0.1:5501",
        "http://localhost:5501",
    ],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

create_tables()


# ---------- Request models ----------

class SubjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)


class SubjectUpdate(BaseModel):
    progress: int = Field(ge=0, le=100)


class TaskCreate(BaseModel):
    title: str = Field(min_length=1, max_length=250)
    subject: str = Field(default="General", max_length=100)
    date: date
    priority: Literal["Low", "Medium", "High"] = "Medium"


class TaskUpdate(BaseModel):
    completed: bool


class FocusCreate(BaseModel):
    minutes: int = Field(gt=0, le=180)
    session_type: Literal["focus", "break"] = "focus"


class AssistantRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)


# ---------- Health check ----------

@app.get("/")
def home():
    return {
        "name": "AI Smart Study Planner",
        "status": "online",
        "docs": "/docs",
    }


@app.get("/api/health")
def health():
    return {"status": "healthy", "database": "connected"}


# ---------- Subjects ----------

@app.get("/api/subjects")
def get_subjects(db: Session = Depends(get_db)):
    subjects = db.query(Subject).order_by(Subject.id).all()

    return [
        {
            "id": item.id,
            "name": item.name,
            "progress": item.progress,
        }
        for item in subjects
    ]


@app.post("/api/subjects", status_code=201)
def create_subject(
    payload: SubjectCreate,
    db: Session = Depends(get_db),
):
    name = payload.name.strip()

    if not name:
        raise HTTPException(400, "Subject name cannot be empty.")

    existing = (
        db.query(Subject)
        .filter(Subject.name.ilike(name))
        .first()
    )

    if existing:
        raise HTTPException(409, "This subject already exists.")

    subject = Subject(name=name, progress=0)
    db.add(subject)
    db.commit()
    db.refresh(subject)

    return {
        "id": subject.id,
        "name": subject.name,
        "progress": subject.progress,
    }


@app.patch("/api/subjects/{subject_id}")
def update_subject(
    subject_id: int,
    payload: SubjectUpdate,
    db: Session = Depends(get_db),
):
    subject = db.get(Subject, subject_id)

    if not subject:
        raise HTTPException(404, "Subject not found.")

    subject.progress = payload.progress
    db.commit()
    db.refresh(subject)

    return {
        "id": subject.id,
        "name": subject.name,
        "progress": subject.progress,
    }


@app.delete("/api/subjects/{subject_id}")
def delete_subject(
    subject_id: int,
    db: Session = Depends(get_db),
):
    subject = db.get(Subject, subject_id)

    if not subject:
        raise HTTPException(404, "Subject not found.")

    db.delete(subject)
    db.commit()

    return {"message": "Subject deleted."}


# ---------- Study tasks ----------

def serialize_task(task: Task):
    return {
        "id": task.id,
        "title": task.title,
        "subject": task.subject,
        "date": task.date.isoformat(),
        "priority": task.priority,
        "completed": task.completed,
    }


@app.get("/api/tasks")
def get_tasks(
    task_date: date | None = None,
    completed: bool | None = None,
    db: Session = Depends(get_db),
):
    query = db.query(Task)

    if task_date is not None:
        query = query.filter(Task.date == task_date)

    if completed is not None:
        query = query.filter(Task.completed == completed)

    tasks = query.order_by(Task.date, Task.id).all()

    return [serialize_task(task) for task in tasks]


@app.post("/api/tasks", status_code=201)
def create_task(
    payload: TaskCreate,
    db: Session = Depends(get_db),
):
    title = payload.title.strip()

    if not title:
        raise HTTPException(400, "Task title cannot be empty.")

    task = Task(
        title=title,
        subject=payload.subject.strip() or "General",
        date=payload.date,
        priority=payload.priority,
        completed=False,
    )

    db.add(task)
    db.commit()
    db.refresh(task)

    return serialize_task(task)


@app.patch("/api/tasks/{task_id}")
def update_task(
    task_id: int,
    payload: TaskUpdate,
    db: Session = Depends(get_db),
):
    task = db.get(Task, task_id)

    if not task:
        raise HTTPException(404, "Task not found.")

    task.completed = payload.completed
    db.commit()
    db.refresh(task)

    return serialize_task(task)


@app.delete("/api/tasks/{task_id}")
def delete_task(
    task_id: int,
    db: Session = Depends(get_db),
):
    task = db.get(Task, task_id)

    if not task:
        raise HTTPException(404, "Task not found.")

    db.delete(task)
    db.commit()

    return {"message": "Task deleted."}


# ---------- Focus timer sessions ----------

@app.post("/api/focus-sessions", status_code=201)
def create_focus_session(
    payload: FocusCreate,
    db: Session = Depends(get_db),
):
    session = FocusSession(
        minutes=payload.minutes,
        session_type=payload.session_type,
        created_date=date.today(),
    )

    db.add(session)
    db.commit()
    db.refresh(session)

    return {
        "id": session.id,
        "minutes": session.minutes,
        "session_type": session.session_type,
        "created_date": session.created_date.isoformat(),
    }


@app.get("/api/stats")
def get_stats(db: Session = Depends(get_db)):
    tasks = db.query(Task).all()
    subjects = db.query(Subject).count()

    focus_minutes = (
        db.query(FocusSession)
        .filter(
            FocusSession.session_type == "focus",
            FocusSession.created_date == date.today(),
        )
        .with_entities(FocusSession.minutes)
        .all()
    )

    return {
        "total_tasks": len(tasks),
        "completed_tasks": sum(
            1 for task in tasks if task.completed
        ),
        "subjects": subjects,
        "focus_minutes_today": sum(
            minutes for (minutes,) in focus_minutes
        ),
    }


# ---------- AI study assistant ----------

def demo_study_answer(message: str) -> str:
    text = message.lower()

    if any(word in text for word in ["revision", "revise"]):
        return (
            "Use active recall: review a topic, close your notes, "
            "explain it from memory, and solve practice questions."
        )

    if any(word in text for word in ["focus", "concentrate"]):
        return (
            "Choose one task, silence notifications, and study for "
            "25 minutes before taking a short break."
        )

    if any(word in text for word in ["exam", "test"]):
        return (
            "Prioritize your syllabus, practice previous questions, "
            "and keep a list of mistakes to review."
        )

    if any(word in text for word in ["schedule", "time", "plan"]):
        return (
            "List your tasks, rank them by importance, estimate their "
            "duration, and schedule the hardest task during your "
            "most productive hours."
        )

    if any(word in text for word in ["coding", "programming", "code"]):
        return (
            "Study one programming concept, write a small example, "
            "and solve two or three problems without copying solutions."
        )

    return (
        "Start with one specific topic, complete a focused study "
        "session, then test yourself to check what you remember."
    )


@app.post("/api/assistant")
def study_assistant(payload: AssistantRequest):
    message = payload.message.strip()

    if not message:
        raise HTTPException(400, "Please enter a question.")

    api_key = os.getenv("OPENAI_API_KEY", "").strip()

    # Real AI mode is optional. Without a key, use the demo assistant.
    if api_key:
        try:
            client = OpenAI(api_key=api_key)

            response = client.responses.create(
                model=os.getenv("OPENAI_MODEL", "gpt-4.1-mini"),
                instructions=(
                    "You are a helpful study planning assistant for "
                    "students. Give practical, age-appropriate study "
                    "advice. Keep answers clear and concise. Do not "
                    "claim to have changed the user's tasks or data."
                ),
                input=message,
            )

            return {
                "reply": response.output_text,
                "mode": "ai",
            }

        except Exception:
            # Do not expose API keys or internal exception details.
            raise HTTPException(
                502,
                "The AI service is currently unavailable. "
                "Check your server configuration and try again.",
            )

    return {
        "reply": demo_study_answer(message),
        "mode": "demo",
    }