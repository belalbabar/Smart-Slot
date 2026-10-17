import CrudPage from "../CrudPage";

export const Rooms = () => (
  <CrudPage title="Rooms & Labs" path="rooms"
    fields={[
      { key: "name", label: "Room name" },
      { key: "type", label: "Type", options: ["theory", "lab"] },
      { key: "lab_kind", label: "Lab kind", options: ["hardware", "software"] },
    ]} />
);