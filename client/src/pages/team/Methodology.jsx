import React from 'react';
import { Link } from 'react-router-dom';
import { Legend, Loading, PageHead, useApi } from '../../components/ui';

export default function Methodology() {
  const s = useApi('/settings');
  if (s.loading) return <Loading />;
  const { load, acwrBands: b, weeklyChangeBands: w, wellness } = s.data;
  const rolling = load.method !== 'ewma';
  return <div style={{ maxWidth: 920 }}>
    <PageHead back="/primer-equipo" title="Cómo se calcula" sub="Puedes cambiar el método y los umbrales en Configuración → Carga y colores" />
    <div className="stack" style={{ gap: 14 }}>
      <div className="card"><h3>1. Carga de sesión y carga diaria</h3>
        <p><b>Carga de sesión (UA)</b> = duración real en minutos × RPE de la sesión (escala 0–10). El jugador no calcula nada: la app lo hace en el servidor al guardar.</p>
        <p><b>Partidos</b>: RPE fijo de {load.matchRpe ?? 10} × minutos jugados según el acta o las estadísticas del partido. Se calcula automáticamente al guardar o importar el acta; los jugadores no lo registran.</p>
        <p style={{ marginBottom: 0 }}><b>Carga diaria (UA)</b> = suma de todas las cargas válidas del día (entrenamiento colectivo, entrenamientos adicionales y partido).</p></div>
      <div className="card"><h3>2. Carga aguda, crónica y ACWR · método activo: {rolling ? 'ventanas móviles (acopladas)' : 'EWMA'}</h3>
        {rolling ? <>
          <p><b>Carga aguda (UA/semana)</b> = suma de las cargas de los últimos {load.acuteDays} días naturales, incluido el día de cálculo.</p>
          <p><b>Carga crónica (UA/semana)</b> = suma de los últimos {load.chronicDays} días ÷ {load.chronicDays / 7}, es decir, la <b>media semanal</b> de ese periodo. Si el jugador lleva menos de {load.chronicDays} días de exposición (desde su primer registro) pero al menos {load.minChronicDays}, se usa la media semanal del periodo disponible: suma de E días ÷ (E/7).</p>
          <p style={{ marginBottom: 0 }}><b>ACWR</b> = aguda ÷ crónica. Ambas están en UA/semana, así que nunca se compara una carga semanal con una media diaria.</p>
        </> : <>
          <p><b>EWMA</b> (media móvil exponencialmente ponderada) sobre la carga diaria: EWMA<sub>hoy</sub> = carga<sub>hoy</sub> × λ + (1 − λ) × EWMA<sub>ayer</sub>, con λ = 2/(N+1).</p>
          <p>Aguda: N = {load.ewmaAcuteDays} días (λ = {(2 / (load.ewmaAcuteDays + 1)).toFixed(3)}). Crónica: N = {load.ewmaChronicDays} días (λ = {(2 / (load.ewmaChronicDays + 1)).toFixed(3)}). Ambas en UA/día.</p>
          <p style={{ marginBottom: 0 }}><b>ACWR</b> = EWMA aguda ÷ EWMA crónica. Los días con registro pendiente no actualizan la media (no se imputan).</p>
        </>}</div>
      <div className="card"><h3>3. Datos incompletos</h3>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          <li><b>Carga cero real:</b> el jugador registró la sesión con RPE 0, o no había sesión programada ese día.</li>
          <li><b>Registro pendiente:</b> había un entrenamiento colectivo programado, el jugador no está marcado como ausente, justificado o lesionado (ni tiene una lesión abierta) y no envió su RPE. <b>No se interpreta como cero.</b></li>
          <li><b>Datos insuficientes:</b> menos de {load.acuteDays} días de exposición para la aguda o menos de {load.minChronicDays} para la crónica.</li>
          <li>No se calcula ACWR (aparece en gris, «n/c») si hay algún registro pendiente en la ventana aguda, más de {load.maxMissingChronic} en la crónica, exposición insuficiente o carga crónica igual a cero.</li>
          <li>Cada indicador muestra el periodo utilizado y la fecha y hora en que se calculó. Se recalcula cada vez que se abre la pantalla.</li>
        </ul></div>
      <div className="card"><h3>4. Colores</h3>
        <Legend />
        <table className="t" style={{ marginTop: 12 }}><thead><tr><th>Indicador</th><th>Verde</th><th>Amarillo</th><th>Naranja</th><th>Rojo</th></tr></thead><tbody>
          <tr><td><b>ACWR</b></td><td>{b.green.join(' – ')}</td><td>{b.yellow.map(r => r.join('–')).join(' y ')}</td><td>{b.orange.map(r => r.join('–')).join(' y ')}</td><td>Fuera de los anteriores</td></tr>
          <tr><td><b>Carga aguda</b> (variación respecto a los 7 días previos)</td><td>≤ ±{w.green} %</td><td>≤ ±{w.yellow} %</td><td>≤ ±{w.orange} %</td><td>&gt; ±{w.orange} %</td></tr>
          <tr><td><b>Wellness</b> (% del estado más favorable)</td><td>≥ {wellness.bands.green} %</td><td>≥ {wellness.bands.yellow} %</td><td>≥ {wellness.bands.orange} %</td><td>&lt; {wellness.bands.orange} %</td></tr>
        </tbody></table>
        <p className="small muted">{b.note}</p>
        <p className="small" style={{ marginBottom: 0 }}><b>Wellness:</b> cada ítem se convierte a un porcentaje donde 100 % es siempre el estado más favorable, según la dirección configurada de cada ítem («más alto es mejor» o «más bajo es mejor»). Por eso el color de la fatiga o del dolor muscular se interpreta igual en el formulario y en los gráficos, aunque su escala vaya al revés que la del sueño. La carga crónica no tiene color de estado: es la referencia del ACWR.</p>
      </div>
      <div className="card"><h3>5. Limitaciones</h3><p style={{ margin: 0 }}>Ningún valor aislado de ACWR permite predecir lesiones. Los colores ayudan a priorizar la revisión de datos, no sustituyen el criterio profesional ni constituyen un diagnóstico de riesgo individual. Los umbrales iniciales son editables y deben revisarse según la población y el contexto.</p></div>
    </div>
  </div>;
}
