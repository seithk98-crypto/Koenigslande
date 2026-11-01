
import { useEffect, useState } from 'react';
import { supabase } from './supabase';

type Props = {
  children: React.ReactNode;
};

export default function StartingVillageGate({ children }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    async function createVillage() {
      const { data, error } = await supabase.rpc(
        'create_starting_village'
      );

      if (!active) return;

      if (error) {
        setError(error.message);
      } else if (!data) {
        setError('Supabase hat keine Dorf-ID zurückgegeben.');
      }

      setLoading(false);
    }

    createVillage();

    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return <div style={{ padding: 40, color: '#e8d5ad' }}>
      Dein Königreich wird vorbereitet ...
    </div>;
  }

  if (error) {
    return <div style={{ padding: 40, color: '#ff8888' }}>
      <h2>Dein Dorf konnte nicht geladen werden.</h2>
      <p>{error}</p>
    </div>;
  }

  return <>{children}</>;
}
