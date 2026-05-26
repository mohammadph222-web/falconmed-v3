import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'

export default function App() {

  const [status, setStatus] = useState('Connecting...')

  useEffect(() => {

    async function testConnection() {

      const { data, error } = await supabase
        .from('organizations')
        .select('*')

      if (error) {
        console.error(error)
        setStatus('Supabase connection failed')
        return
      }

      console.log(data)

      setStatus('Supabase connected successfully')

    }

    testConnection()

  }, [])

  return (
    <div
      style={{
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0B1120',
        color: 'white',
        fontFamily: 'Inter, sans-serif',
      }}
    >
      <div>

        <h1 style={{ fontSize: '48px', marginBottom: '12px' }}>
          FalconMed v3
        </h1>

        <p style={{ opacity: 0.7 }}>
          {status}
        </p>

      </div>
    </div>
  )
}