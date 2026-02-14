import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '../supabaseClient';
import './IdentityCard.css';

const IdentityCard = () => {
  const [identity, setIdentity] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const debounceRef = useRef();

  // Fetch identity on mount
  useEffect(() => {
    const fetchIdentity = async () => {
      setLoading(true);
      setError(null);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setError('Not authenticated');
        setLoading(false);
        return;
      }
      const { data, error } = await supabase
        .from('profiles')
        .select('identity')
        .eq('id', user.id)
        .single();
      if (error) setError(error.message);
      else setIdentity(data?.identity || '');
      setLoading(false);
    };
    fetchIdentity();
  }, []);

  // Debounced auto-save
  useEffect(() => {
    if (loading) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSaving(true);
      setError(null);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setError('Not authenticated');
        setSaving(false);
        return;
      }
      const { error } = await supabase
        .from('profiles')
        .update({ identity: identity })
        .eq('id', user.id);
      if (error) setError(error.message);
      setSaving(false);
    }, 800);
    return () => clearTimeout(debounceRef.current);
    // eslint-disable-next-line
  }, [identity]);

  return (
    <div className="identity-card-container">
      <h2 className="identity-title">WHO I AM BECOMING</h2>
      <textarea
        className="identity-textarea"
        value={identity}
        onChange={e => setIdentity(e.target.value)}
        placeholder="Dit is wie ik aan het worden ben..."
        rows={5}
        disabled={loading}
      />
      {/* Floating pen icon for aspirational feel */}
      <svg className="identity-pen" viewBox="0 0 24 24" fill="none" stroke="#b3b8c7" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12.5 6.5l5 5M3 21l2.5-7.5L17 2.5a2.121 2.121 0 013 3L8.5 17.5 3 21z"/></svg>
      <div className="identity-status">
        {loading ? 'Loading...' : saving ? 'Saving...' : error ? error : ''}
      </div>
    </div>
  );
};

export default IdentityCard;