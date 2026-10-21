from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from database import get_db
from auth import get_current_admin, get_current_hod
from models import Degree, Teacher, Room, Course, AcademicSession, User

# is router ke saare routes par login zaroori hai
router = APIRouter(dependencies=[Depends(get_current_admin)])


def make_crud(path, Model, fields, required, allow_delete=True, validate=None,
              write_access=get_current_admin, read_access=get_current_admin):
    def clean(data: dict):
        out = {}
        for f in fields:
            v = data.get(f)
            if isinstance(v, str):
                v = v.strip()
            if f in required and (v is None or v == ""):
                raise HTTPException(400, f"{f} is required")
            if v == "":
                v = None
            out[f] = v
        if validate:
            validate(out)
        return out

    def to_dict(obj):
        d = {"id": obj.id}
        for f in fields:
            d[f] = getattr(obj, f)
        return d

    @router.get(f"/{path}", name=f"list_{path}")
    def list_items(db: Session = Depends(get_db),
                   user: User = Depends(read_access)):
        return [to_dict(i) for i in db.query(Model).order_by(Model.id).all()]

    @router.post(f"/{path}", name=f"create_{path}")
    def create_item(data: dict, db: Session = Depends(get_db),
                    user: User = Depends(write_access)):
        obj = Model(**clean(data))
        db.add(obj)
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            raise HTTPException(400, "Already exists")
        return to_dict(obj)

    @router.put(f"/{path}/{{item_id}}", name=f"update_{path}")
    def update_item(item_id: int, data: dict, db: Session = Depends(get_db),
                    user: User = Depends(write_access)):
        obj = db.get(Model, item_id)
        if not obj:
            raise HTTPException(404, "Not found")
        for k, v in clean(data).items():
            setattr(obj, k, v)
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            raise HTTPException(400, "Already exists")
        return to_dict(obj)

    if allow_delete:
        @router.delete(f"/{path}/{{item_id}}", name=f"delete_{path}")
        def delete_item(item_id: int, db: Session = Depends(get_db),
                        user: User = Depends(write_access)):
            obj = db.get(Model, item_id)
            if not obj:
                raise HTTPException(404, "Not found")
            db.delete(obj)
            try:
                db.commit()
            except IntegrityError:
                db.rollback()
                raise HTTPException(400, "This item is in use and cannot be deleted")
            return {"deleted": item_id}


def check_room(d):
    if d.get("type") not in ("lab", "theory"):
        raise HTTPException(400, "type must be lab or theory")
    if d["type"] == "lab":
        if d.get("lab_kind") not in ("hardware", "software"):
            raise HTTPException(400, "Lab kind (hardware/software) is required for a lab")
    else:
        d["lab_kind"] = None


make_crud("teachers", Teacher, ["name", "email"], ["name"],
          write_access=get_current_hod)
make_crud("rooms", Room, ["name", "type", "lab_kind"], ["name", "type"],
          validate=check_room, read_access=get_current_hod)