import { useEffect, useState } from "react";

function App() {
  const [msg, setMsg] = useState("Loading...");

  useEffect(() => {
    fetch("http://127.0.0.1:8000/")
      .then((res) => res.json())
      .then((data) => setMsg(data.message))
      .catch(() => setMsg("Backend not reachable"));
  }, []);

  return <h1>{msg}</h1>;
}

export default App;