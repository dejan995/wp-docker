import { useState } from "react";
import { Card, CardBody, Input, Button } from "@tabler/core";
import { Link, useNavigate } from "react-router-dom";

export default function Register() {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  const handleRegister = async (e) => {
    e.preventDefault();
    setError(null);

    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, name }),
    });

    if (res.ok) {
      // Registration successful → redirect to login
      navigate("/login");
    } else {
      const data = await res.json();
      if (data.error && data.error.includes("Registration is closed")) {
        setError("Registration closed. Please log in instead.");
      } else {
        setError("Registration failed. Try again.");
      }
    }
  };

  return (
    <div className="flex h-screen items-center justify-center bg-gray-50">
      <Card className="w-96 shadow-lg">
        <CardBody>
          <h2 className="text-xl font-bold mb-4">Create Admin Account</h2>
          {error && <p className="text-red-500">{error}</p>}
          <form onSubmit={handleRegister}>
            <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} />
            <Input label="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <Input label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <Button type="submit" className="w-full mt-4">Register</Button>
          </form>
          <p className="text-sm mt-4">
            Already have an account? <Link to="/login" className="text-blue-600">Login</Link>
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
