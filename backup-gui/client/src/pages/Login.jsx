import { useState } from "react";
import { Card, CardBody, Input, Button } from "@tabler/core";

export default function Login({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);

  const handleLogin = async (e) => {
    e.preventDefault();
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (res.ok) {
      onLogin();
    } else {
        if (res.status === 401) {
        setError("Invalid credentials");
    } else if (res.status === 403) {
        setError("No users exist yet. Please register the first account.");
        }
    }
  };

  return (
    <div className="flex h-screen items-center justify-center bg-gray-50">
      <Card className="w-96">
        <CardBody>
          <h2 className="text-xl font-bold mb-4">Login</h2>
          {error && error.includes("register") && (
            <p className="text-sm mt-2">
                <Link to="/register" className="text-blue-600">Go to Registration</Link>
            </p>
                )}
          <form onSubmit={handleLogin}>
            <Input label="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <Input label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <Button type="submit" className="w-full mt-4">Login</Button>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
