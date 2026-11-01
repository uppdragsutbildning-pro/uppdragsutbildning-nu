import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { toast } from 'sonner';
import { supabase } from '../lib/supabase';

// Inloggning med engångskod via e-post (samma flöde som Mitt konto), för formulär som
// behöver en inloggad köpare vid inskick. Mejlet innehåller både kod och länk; länken
// går till redirectPath (måste ligga i Redirect URLs i Supabase Auth).
export function useEmailCodeLogin(redirectPath?: string) {
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function sendCode(email: string): Promise<boolean> {
    setSending(true);
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}${redirectPath ?? '/konto'}` },
    });
    setSending(false);
    if (otpError) {
      toast.error('Kunde inte skicka koden', { description: otpError.message });
      return false;
    }
    setError(null);
    setCooldown(60);
    return true;
  }

  async function verify(email: string, code: string): Promise<User | null> {
    setError(null);
    setVerifying(true);
    const { data, error: verifyError } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: 'email',
    });
    setVerifying(false);
    if (verifyError || !data.user) {
      setError('Koden stämmer inte eller har gått ut. Kontrollera koden eller skicka en ny.');
      return null;
    }
    return data.user;
  }

  return { sending, verifying, error, cooldown, sendCode, verify };
}
