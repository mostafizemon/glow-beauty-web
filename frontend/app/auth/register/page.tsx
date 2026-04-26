"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/hooks/useAuth";

export default function RegisterPage() {
  const { register } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState({ name: "", phone: "", password: "", confirmPassword: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!form.name || !form.phone || !form.password) { setError("All fields are required"); return; }
    if (!/^01\d{9}$/.test(form.phone)) { setError("Please enter a valid phone number (01XXXXXXXXX)"); return; }
    if (form.password.length < 6) { setError("Password must be at least 6 characters"); return; }
    if (form.password !== form.confirmPassword) { setError("Passwords don't match"); return; }

    setLoading(true);
    try {
      await register(form.phone, form.name, form.password);
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="font-heading text-3xl font-bold text-charcoal mb-2">Create Account</h1>
          <p className="text-charcoal-lighter">Join Glow & Beauty Goals</p>
        </div>

        <div className="card p-6 md:p-8">
          {error && <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg p-3 mb-4">{error}</div>}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="input-label">Full Name</label>
              <input value={form.name} onChange={(e) => setForm(p => ({...p, name: e.target.value}))} className="input" placeholder="Your name" />
            </div>
            <div>
              <label className="input-label">Phone Number</label>
              <input type="tel" value={form.phone} onChange={(e) => setForm(p => ({...p, phone: e.target.value}))} className="input" placeholder="01XXXXXXXXX" />
            </div>
            <div>
              <label className="input-label">Password</label>
              <input type="password" value={form.password} onChange={(e) => setForm(p => ({...p, password: e.target.value}))} className="input" placeholder="Min 6 characters" />
            </div>
            <div>
              <label className="input-label">Confirm Password</label>
              <input type="password" value={form.confirmPassword} onChange={(e) => setForm(p => ({...p, confirmPassword: e.target.value}))} className="input" placeholder="Re-enter password" />
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full">{loading ? "Creating Account..." : "Create Account"}</button>
          </form>

          <p className="mt-6 text-center text-sm text-charcoal-lighter">
            Already have an account?{" "}
            <Link href="/auth/login" className="text-rose-gold font-medium hover:underline">Sign In</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
