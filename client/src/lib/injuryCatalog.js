// Catálogo de lesiones frecuentes en fútbol con guía de readaptación por fases,
// criterios de progresión, plazos orientativos (solo cuando hay datos publicados) y anamnesis.
// Es una GUÍA DE REFERENCIA basada en la bibliografía citada en cada lesión: no sustituye
// la valoración ni las indicaciones del médico o fisioterapeuta, y las fases nunca avanzan solas.
//
// Cada protocolo tiene 6 fases que se corresponden, por orden, con las 6 fases generales de la app:
// 1 Inicial y control de síntomas · 2 Movilidad, fuerza básica y función · 3 Fuerza y control neuromuscular
// 4 Carrera y tareas específicas · 5 Entrenamiento colectivo · 6 Competición y seguimiento

const P = (name, objectives, work, criteria, caution) => ({ name, objectives, work, criteria, caution });

// ---------- Anamnesis común a todas las lesiones ----------
// type: yn (sí/no) · opt (una opción) · multi (varias) · num · text · date
// flag: respuesta(s) que conviene tener en cuenta en la planificación → aparece en «Puntos clave»
export const GENERAL_Q = [
  { id: 'g_dom', q: 'Pierna dominante', type: 'opt', options: ['Derecha', 'Izquierda', 'Ambas'], why: 'Para interpretar las asimetrías (LSI) en los tests y el gesto de golpeo.' },
  { id: 'g_onset', q: '¿Cómo apareció?', type: 'opt', options: ['De golpe (aguda)', 'Poco a poco (progresiva)'] },
  { id: 'g_stop', q: '¿Pudo seguir jugando o entrenando?', type: 'opt', options: ['Sí, terminó la sesión', 'Siguió con molestias', 'No, tuvo que parar'], flag: ['No, tuvo que parar'], flagText: 'Tuvo que abandonar la actividad: suele asociarse a lesiones de mayor gravedad.' },
  { id: 'g_pain0', q: 'Dolor en el momento de la lesión (0–10)', type: 'num', min: 0, max: 10, flagMin: 7, flagText: 'Dolor inicial alto (≥7/10).' },
  { id: 'g_prev', q: '¿Ha tenido antes una lesión en la misma zona?', type: 'opt', options: ['No', 'Sí, hace menos de 2 meses', 'Sí, hace 2–12 meses', 'Sí, hace más de 1 año'], flag: ['Sí, hace menos de 2 meses', 'Sí, hace 2–12 meses', 'Sí, hace más de 1 año'], flagText: 'Lesión previa en la misma zona: es uno de los factores de riesgo de recaída más aceptados.' },
  { id: 'g_load', q: '¿Cambio reciente de carga? (más volumen, vuelta de vacaciones, más partidos, otra superficie o calzado)', type: 'yn', flag: ['Sí'], flagText: 'Cambio reciente de carga: revisar la progresión del entrenamiento al volver.' },
  { id: 'g_tests', q: 'Pruebas realizadas', type: 'multi', options: ['Exploración médica', 'Exploración de fisioterapia', 'Ecografía', 'Resonancia', 'Radiografía', 'Ninguna'] },
  { id: 'g_med', q: 'Tratamiento o indicaciones del médico / fisioterapeuta', type: 'text', placeholder: 'Medicación, reposo, órtesis, restricciones…' },
  { id: 'g_fear', q: 'Confianza para volver a jugar', type: 'opt', options: ['Total', 'Algo de miedo', 'Mucho miedo o inseguridad'], flag: ['Mucho miedo o inseguridad'], flagText: 'Inseguridad para volver: la preparación psicológica forma parte de los criterios de retorno.' },
  { id: 'g_goal', q: 'Objetivo o fecha que le importa (partido, torneo…)', type: 'text' },
];

// ---------- Catálogo ----------
export const CATALOG = [
  {
    key: 'isquios', name: 'Lesión muscular de isquiosurales', short: 'Isquiosurales', zone: 'Isquiosurales', region: 'Muslo', type: 'Muscular', icon: '🦵',
    gradeLabel: 'Grado (resonancia)', grades: [
      { v: 'Grado 0 (sin hallazgos en RM)', days: [5, 11], ref: '8 ± 3 días' }, { v: 'Grado 1 (edema, sin rotura de fibras)', days: [7, 27], ref: '17 ± 10 días' },
      { v: 'Grado 2 (rotura parcial)', days: [11, 33], ref: '22 ± 11 días' }, { v: 'Grado 3 (rotura completa)', days: [13, 133], ref: '73 ± 60 días' }, { v: 'Sin prueba de imagen' }],
    timeNote: 'Tiempo hasta volver a jugar en el estudio UEFA de equipos profesionales europeos (media ± DE). En la misma serie, el 70 % eran grado 0–1.',
    mechs: ['Sprint / carrera a alta velocidad', 'Estiramiento (golpeo, apertura, deslizamiento)', 'Contacto directo', 'Otro'],
    questions: [
      { id: 'h_musc', q: 'Músculo afectado', type: 'opt', options: ['Bíceps femoral', 'Semimembranoso', 'Semitendinoso', 'No se sabe'] },
      { id: 'h_tend', q: '¿La imagen muestra afectación del tendón intramuscular?', type: 'opt', options: ['No', 'Sí', 'Sin imagen / no se sabe'], flag: ['Sí'], flagText: 'Afectación del tendón intramuscular: progresar con más tests y más prudencia en cada fase.' },
      { id: 'h_walk', q: 'Las primeras 24 h, ¿podía caminar sin dolor?', type: 'opt', options: ['Sí', 'Con dolor', 'No'], flag: ['No'], flagText: 'Dolor al caminar en las primeras 24 h.' },
      { id: 'h_nordic', q: '¿Hacía trabajo excéntrico de isquios (p. ej. nórdicos) de forma regular?', type: 'yn', flag: ['No'], flagText: 'Sin trabajo excéntrico previo: incluirlo en la readaptación y mantenerlo después del alta.' },
      { id: 'h_speed', q: '¿Estaba acumulando muchos sprints o volvía de un periodo sin velocidad?', type: 'yn' },
    ],
    phases: [
      P('Protección y control del dolor', ['Controlar dolor e inflamación', 'Caminar sin dolor'], ['Isométricos submáximos sin dolor en varias longitudes', 'Movilidad activa suave', 'Trabajo del resto del cuerpo y de la pierna sana'], ['Camina con normalidad y sin dolor', 'Isométrico de isquios submáximo sin dolor', 'Elevación de pierna recta con poca diferencia respecto al lado sano']),
      P('Movilidad y fuerza básica', ['Recuperar rango de movimiento', 'Iniciar fuerza dinámica'], ['Puentes de glúteo y de isquios (una y dos piernas)', 'Peso muerto rumano ligero', 'Bici estática y carrera suave en línea recta (trote)'], ['Flexibilidad similar al lado sano (EPR, extensión activa de rodilla)', 'Puente a una pierna sin dolor', 'Trote continuo sin dolor']),
      P('Fuerza excéntrica y control', ['Fuerza en posiciones de elongación', 'Control lumbopélvico'], ['Nórdicos progresivos, peso muerto a una pierna', 'Ejercicios en posición alargada (deslizamientos, “diver”)', 'Carrera progresiva: 60 → 80 % de la velocidad'], ['Fuerza isométrica/excéntrica ≥ 90 % del lado sano (LSI)', 'H-test de Askling sin inseguridad', 'Carrera al 80 % sin molestias']),
      P('Velocidad y tareas específicas', ['Exposición a alta velocidad', 'Gestos de fútbol'], ['Sprints progresivos hasta velocidad máxima', 'Aceleraciones, frenadas, cambios de dirección', 'Golpeo progresivo y tareas con balón'], ['Sprint a velocidad máxima sin dolor ni miedo', 'Volumen de alta velocidad similar al habitual (si hay GPS)', 'Sin dolor al día siguiente']),
      P('Entrenamiento colectivo', ['Integración gradual con el grupo'], ['Empezar por tareas sin oposición y luego con contacto', 'Mantener 1–2 sesiones/semana de fuerza excéntrica'], ['Completa varias sesiones completas sin síntomas', 'Decisión compartida jugador–médico–preparador']),
      P('Competición y prevención de recaídas', ['Volver a competir', 'Evitar la recaída'], ['Minutos progresivos', 'Programa de prevención (nórdicos, sprint regular)'], ['Juega partido completo sin síntomas'], 'El riesgo de recaída es mayor en las primeras semanas tras volver.'),
    ],
    refs: [
      { t: 'Ekstrand et al. 2012 · Hamstring injuries in professional football: MRI findings and return to play (BJSM)', u: 'https://bjsm.bmj.com/content/46/2/112.full' },
      { t: 'Valle et al. 2015 · Hamstring muscle injuries, a rehabilitation protocol purpose (Asian J Sports Med)', u: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC4691307' },
      { t: 'Whiteley et al. 2019 · Rehabilitation and return to sport after hamstring injury (Aspetar)', u: 'https://journal.aspetar.com/en/journals/volume-8-targeted-topic-hamstring-injuries-aspetar-experience/rehabilitation-and-return-to-sport-after-hamstring-injury' },
    ],
  },
  {
    key: 'cuadriceps', name: 'Lesión muscular de cuádriceps', short: 'Cuádriceps', zone: 'Cuádriceps', region: 'Muslo', type: 'Muscular', icon: '🦵',
    gradeLabel: 'Músculo afectado', grades: [{ v: 'Recto femoral', days: [14, 47], ref: '30 ± 17 días' }, { v: 'Vastos', days: [6, 23], ref: '15 ± 8 días' }, { v: 'No se sabe' }],
    timeNote: 'Datos de jugadores de élite de fútbol australiano (registro AFL): el recto femoral tarda más que los vastos y la lesión al golpear es la que más tarda.',
    mechs: ['Golpeo / chut', 'Sprint / aceleración', 'Golpe directo (contusión)', 'Otro'],
    questions: [
      { id: 'q_kick', q: '¿Se lesionó la pierna de golpeo?', type: 'yn', flag: ['Sí'], flagText: 'Lesión en la pierna de golpeo: la progresión del chut debe ser muy gradual.' },
      { id: 'q_pull', q: '¿Notó un tirón / pinchazo o fue un golpe?', type: 'opt', options: ['Tirón o pinchazo', 'Golpe directo', 'No lo sabe'] },
      { id: 'q_prox', q: 'Localización del dolor', type: 'opt', options: ['Parte alta (cerca de la cadera)', 'Mitad del muslo', 'Parte baja (cerca de la rodilla)'], flag: ['Parte alta (cerca de la cadera)'], flagText: 'Dolor proximal: descartar afectación del tendón proximal del recto femoral.' },
      { id: 'q_lump', q: '¿Se nota un bulto o hundimiento?', type: 'yn', flag: ['Sí'], flagText: 'Bulto o hundimiento: consultar con el médico (posible rotura completa).' },
    ],
    phases: [
      P('Protección y control del dolor', ['Controlar dolor', 'Caminar sin dolor'], ['Isométricos de cuádriceps sin dolor', 'Movilidad suave de rodilla y cadera'], ['Camina sin dolor', 'Flexión de rodilla en prono similar al lado sano']),
      P('Movilidad y fuerza básica', ['Recuperar flexión de rodilla y extensión de cadera'], ['Sentadilla y prensa parcial', 'Extensión de rodilla ligera', 'Bici y trote'], ['Test de Thomas / flexión en prono sin dolor', 'Trote sin dolor']),
      P('Fuerza y control', ['Fuerza excéntrica en elongación'], ['Nórdicos inversos, zancada búlgara, extensión de rodilla pesada', 'Carrera 60 → 80 %'], ['Fuerza de cuádriceps ≥ 90 % del lado sano', 'Carrera al 80 % sin molestias']),
      P('Velocidad, golpeo y tareas', ['Recuperar sprint y golpeo'], ['Sprints progresivos', 'Pases cortos → largos → chut (progresión de distancia e intensidad)'], ['Chut a máxima potencia sin dolor', 'Sprint máximo sin dolor']),
      P('Entrenamiento colectivo', ['Integración gradual'], ['Sesiones completas con el grupo', 'Mantener fuerza 1–2 días/semana'], ['Varias sesiones completas sin síntomas']),
      P('Competición y seguimiento', ['Volver a competir'], ['Minutos progresivos'], ['Partido completo sin síntomas'], 'Las recaídas del recto femoral suelen ocurrir en los primeros meses, sobre todo al golpear.'),
    ],
    refs: [{ t: 'Pietsch et al. 2023 · Epidemiology of quadriceps muscle strain injuries in elite Australian football (Scand J Med Sci Sports)', u: 'https://pubmed.ncbi.nlm.nih.gov/37994173/' }],
  },
  {
    key: 'gemelo', name: 'Lesión muscular de gemelo / sóleo', short: 'Gemelo / sóleo', zone: 'Pantorrilla', region: 'Pierna', type: 'Muscular', icon: '🦶',
    gradeLabel: 'Músculo afectado', grades: [{ v: 'Gemelo medial' }, { v: 'Gemelo lateral' }, { v: 'Sóleo' }, { v: 'Aponeurosis central (RM)', days: [21, 67], ref: '44 ± 23 días' }, { v: 'No se sabe' }],
    timeNote: 'Las lesiones de la aponeurosis central son las que más tardan; la lesión producida corriendo también se asocia a retornos más largos (fútbol australiano).',
    mechs: ['Corriendo / acelerando', 'Salto o cambio de dirección', 'Otro'],
    questions: [
      { id: 'c_heel', q: '¿Puede hacer elevaciones de talón a una pierna?', type: 'opt', options: ['No', 'Sí, con dolor', 'Sí, sin dolor'], flag: ['No'], flagText: 'No puede hacer elevaciones a una pierna: empezar por isométricos y apoyo bilateral.' },
      { id: 'c_onset', q: '¿Fue un pinchazo brusco o una molestia que fue aumentando?', type: 'opt', options: ['Pinchazo brusco', 'Molestia progresiva'] },
      { id: 'c_age', q: '¿Tiene antecedentes de molestias en el tendón de Aquiles?', type: 'yn' },
    ],
    phases: [
      P('Protección y control del dolor', ['Caminar sin cojera'], ['Isométricos de flexión plantar (rodilla estirada y doblada)', 'Movilidad de tobillo'], ['Camina sin cojera ni dolor', 'Elevación de talón bilateral sin dolor']),
      P('Fuerza básica', ['Fuerza de gemelo y sóleo'], ['Elevaciones de talón de pie (gemelo) y sentado (sóleo) con carga', 'Bici, trote suave'], ['Elevaciones a una pierna similares al lado sano', 'Trote sin dolor']),
      P('Fuerza y capacidad reactiva', ['Fuerza máxima y tolerancia a impacto'], ['Elevaciones con carga alta', 'Saltitos (pogo) y comba progresivos', 'Carrera 60 → 80 %'], ['Repeticiones a una pierna ≥ 90 % del lado sano', 'Saltos a una pierna sin dolor']),
      P('Carrera y tareas específicas', ['Velocidad y cambios de ritmo'], ['Aceleraciones, sprints, cambios de dirección', 'Volumen de carrera progresivo'], ['Sprint y aceleraciones sin dolor', 'Volumen de carrera similar al habitual']),
      P('Entrenamiento colectivo', ['Integración gradual'], ['Sesiones completas con el grupo', 'Mantener trabajo de sóleo'], ['Varias sesiones completas sin síntomas']),
      P('Competición y seguimiento', ['Volver a competir'], ['Minutos progresivos'], ['Partido completo sin síntomas'], 'El riesgo de repetir la lesión es mayor en las primeras 8 semanas tras volver.'),
    ],
    refs: [
      { t: 'Green et al. 2022 · The assessment, management and prevention of calf muscle strain injuries (Sports Med Open)', u: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC8761182' },
      { t: 'Green et al. 2020 · Return to play and recurrence after calf muscle strain injuries (AJSM)', u: 'https://www.ovid.com/journals/ajsm/pdf/10.1177/0363546520959327~return-to-play-and-recurrence-after-calf-muscle-strain' },
    ],
  },
  {
    key: 'aductor', name: 'Lesión aguda de aductores', short: 'Aductores', zone: 'Aductores / ingle', region: 'Cadera e ingle', type: 'Muscular', icon: '🦵',
    gradeLabel: 'Gravedad', grades: [{ v: 'Distensión o rotura parcial', days: [14, 21], ref: '2–3 semanas' }, { v: 'Rotura completa', days: [56, 84], ref: '8–12 semanas' }, { v: 'Sin prueba de imagen' }],
    timeNote: 'Plazos habituales descritos en la bibliografía para el aductor largo; la rotura completa puede requerir valoración quirúrgica.',
    mechs: ['Golpeo', 'Cambio de dirección', 'Estirarse a por un balón (apertura)', 'Otro'],
    questions: [
      { id: 'a_pop', q: '¿Notó un chasquido?', type: 'yn', flag: ['Sí'], flagText: 'Chasquido: valorar con imagen una posible rotura o desinserción del tendón.' },
      { id: 'a_squeeze', q: 'Test de compresión de aductores (squeeze) — dolor 0–10', type: 'num', min: 0, max: 10 },
      { id: 'a_prev', q: '¿Tenía molestias en la ingle antes de la lesión?', type: 'yn', flag: ['Sí'], flagText: 'Molestias inguinales previas: vigilar la evolución hacia dolor inguinal de larga evolución.' },
    ],
    phases: [
      P('Protección y control del dolor', ['Controlar dolor'], ['Isométricos de aductores sin dolor (balón entre rodillas)', 'Movilidad suave de cadera'], ['Camina sin dolor', 'Squeeze isométrico sin dolor o con dolor leve']),
      P('Fuerza básica', ['Fuerza de aductores y core'], ['Plancha lateral con apoyo de aductor (Copenhagen corto)', 'Sentadilla lateral, trote'], ['Fuerza de aductores > 80 % del lado sano', 'Trote sin dolor']),
      P('Fuerza y control', ['Fuerza excéntrica y en elongación'], ['Copenhagen largo, deslizamientos laterales', 'Carrera 60 → 80 %, desplazamientos laterales'], ['Fuerza de aductores ≥ 90 % del lado sano', 'Cambios de dirección suaves sin dolor']),
      P('Tareas específicas', ['Golpeo y cambios de dirección'], ['Pase corto → largo → chut', 'Cambios de dirección a alta intensidad'], ['Chut y cambio de dirección máximos sin dolor']),
      P('Entrenamiento colectivo', ['Integración gradual'], ['Sesiones completas', 'Mantener Copenhagen como prevención'], ['Varias sesiones completas sin síntomas']),
      P('Competición y seguimiento', ['Volver a competir'], ['Minutos progresivos'], ['Partido completo sin síntomas']),
    ],
    refs: [
      { t: 'Serner & Jomaah 2014 · Acute groin injuries (Aspetar Sports Medicine Journal)', u: 'https://journal.aspetar.com/en/journals/volume-3-targeted-topic-groin-pain/acute-groin-injuries' },
      { t: 'AANA 2026 · Adductor injuries in athletes: return to play', u: 'https://www.aana.org/education/publications/inside-aana-e-newsletter/february-2026/adductor-injuries-in-the-national-basketball-association-return-to-play-and-player-performance/' },
    ],
  },
  {
    key: 'pubalgia', name: 'Dolor inguinal de larga evolución (pubalgia)', short: 'Pubalgia', zone: 'Ingle / pubis', region: 'Cadera e ingle', type: 'Sobrecarga', icon: '🦴',
    gradeLabel: 'Entidad clínica (acuerdo de Doha)', grades: [{ v: 'Relacionado con aductores' }, { v: 'Relacionado con el psoas ilíaco' }, { v: 'Relacionado con el canal inguinal' }, { v: 'Relacionado con el pubis' }, { v: 'Relacionado con la cadera' }, { v: 'Sin clasificar' }],
    timeNote: 'Sin plazos fijos: la progresión depende de la respuesta del dolor a la carga.',
    mechs: ['Sobrecarga progresiva', 'Tras una lesión aguda', 'Otro'],
    questions: [
      { id: 'pu_time', q: 'Tiempo con molestias', type: 'opt', options: ['Menos de 6 semanas', '6–12 semanas', 'Más de 3 meses'], flag: ['Más de 3 meses'], flagText: 'Más de 3 meses de evolución: plantear valoración médica completa.' },
      { id: 'pu_cough', q: '¿Duele al toser, estornudar o hacer abdominales?', type: 'yn', flag: ['Sí'], flagText: 'Dolor al toser o con abdominales: orienta a origen inguinal.' },
      { id: 'pu_hip', q: '¿Duele al flexionar y rotar la cadera hacia dentro o tiene bloqueos?', type: 'yn', flag: ['Sí'], flagText: 'Dolor con flexión-rotación de cadera: descartar origen articular de cadera.' },
      { id: 'pu_play', q: '¿Puede jugar con el dolor?', type: 'opt', options: ['Sí, sin limitación', 'Sí, rindiendo menos', 'No'] },
      { id: 'pu_hagos', q: 'Puntuación HAGOS (si se ha pasado)', type: 'num', min: 0, max: 100 },
    ],
    phases: [
      P('Control de síntomas', ['Reducir la carga que provoca dolor'], ['Isométricos de aductores y core', 'Mantener actividad que no duela'], ['Dolor en la vida diaria ≤ 2/10', 'Squeeze isométrico tolerable']),
      P('Fuerza básica', ['Fuerza de aductores, abdominales y cadera'], ['Programa de fuerza de aductores y estabilidad lumbopélvica', 'Trote'], ['Trote sin aumento de dolor al día siguiente']),
      P('Fuerza y control', ['Fuerza máxima y control en apoyo unipodal'], ['Copenhagen, ejercicios en carga unipodal', 'Carrera progresiva'], ['Fuerza de aductores ≥ 90 % del lado sano / relación aductor-abductor normal', 'Carrera al 80 % sin dolor']),
      P('Tareas específicas', ['Golpeo y cambios de dirección'], ['Progresión de chut y cambios de dirección'], ['Gestos de fútbol a máxima intensidad sin dolor']),
      P('Entrenamiento colectivo', ['Integración gradual'], ['Sesiones completas y fuerza de mantenimiento'], ['Varias semanas sin recaída de síntomas']),
      P('Competición y seguimiento', ['Volver a competir'], ['Minutos progresivos y programa de prevención'], ['Partido completo sin síntomas']),
    ],
    refs: [{ t: 'Weir et al. 2015 · Doha agreement meeting on terminology and definitions in groin pain in athletes (BJSM)', u: 'https://pubmed.ncbi.nlm.nih.gov/26031643/' }],
  },
  {
    key: 'lca', name: 'Rotura del ligamento cruzado anterior (LCA)', short: 'LCA', zone: 'Rodilla', region: 'Rodilla', type: 'Ligamentosa', icon: '🦿',
    gradeLabel: 'Tratamiento', grades: [{ v: 'Reconstrucción quirúrgica (plastia)' }, { v: 'Tratamiento conservador' }],
    timeNote: 'La cicatrización del injerto no se completa al menos hasta los 9 meses: la decisión de volver se basa en una batería de tests de fuerza, saltos y carrera, no solo en el tiempo.',
    mechs: ['Sin contacto (cambio de dirección, aterrizaje, frenada)', 'Con contacto', 'Otro'],
    questions: [
      { id: 'l_surg', q: 'Fecha de la cirugía', type: 'date' },
      { id: 'l_graft', q: 'Tipo de injerto', type: 'opt', options: ['Hueso-tendón rotuliano-hueso', 'Isquiotibiales', 'Tendón cuadricipital', 'Aloinjerto', 'No se sabe'], why: 'Condiciona la musculatura a proteger y a reforzar.' },
      { id: 'l_assoc', q: 'Lesiones asociadas', type: 'multi', options: ['Menisco (sutura)', 'Menisco (meniscectomía)', 'Cartílago', 'Ligamento colateral', 'Ninguna'], flag: ['Menisco (sutura)', 'Cartílago'], flagText: 'Sutura de menisco o lesión de cartílago: respetar las restricciones de carga y flexión del cirujano.' },
      { id: 'l_ext', q: '¿Tiene la extensión completa de rodilla?', type: 'yn', flag: ['No'], flagText: 'Falta extensión completa: prioridad en las primeras semanas.' },
      { id: 'l_eff', q: '¿Hay derrame o inflamación?', type: 'opt', options: ['No', 'Leve', 'Moderado o importante'], flag: ['Moderado o importante'], flagText: 'Derrame: ajustar la carga hasta controlarlo.' },
      { id: 'l_prev', q: '¿Lesión previa de LCA (misma rodilla o la otra)?', type: 'yn', flag: ['Sí'], flagText: 'LCA previo: riesgo aumentado de nueva lesión; ser muy estricto con los criterios.' },
    ],
    phases: [
      P('Postoperatorio inicial', ['Extensión completa', 'Activar cuádriceps', 'Controlar derrame'], ['Extensión pasiva, elevación de pierna recta sin déficit', 'Movilidad de flexión progresiva', 'Marcha según indicación del cirujano'], ['Extensión completa', 'Elevación de pierna recta sin caída de la rodilla', 'Derrame controlado', 'Marcha normal sin muletas']),
      P('Fuerza básica y función', ['Recuperar flexión y fuerza'], ['Sentadilla, prensa, puentes, bici', 'Equilibrio unipodal'], ['Flexión de rodilla casi completa', 'Sentadilla a una pierna con buen control', 'Fuerza de cuádriceps ≥ 70–80 % del lado sano']),
      P('Fuerza, control y saltos', ['Fuerza máxima', 'Aterrizajes controlados'], ['Fuerza pesada de cuádriceps e isquios', 'Saltos bilaterales → unilaterales', 'Inicio de carrera en línea recta cuando lo indique el equipo médico'], ['Fuerza de cuádriceps e isquios ≥ 80 % del lado sano', 'Aterrizajes sin valgo', 'Carrera continua sin derrame']),
      P('Rehabilitación en el campo', ['Carrera, cambios de dirección y gestos de fútbol'], ['Progresión en campo: carrera → aceleraciones → cambios de dirección → balón → oposición', 'Recuperar la carga de carrera previa'], ['Fuerza ≥ 90 % (LSI)', 'Saltos a una pierna (distancia, triple, cruzado, 6 m) ≥ 90 % del lado sano', 'Agilidad y cambios de dirección sin compensaciones', 'Preparación psicológica (p. ej. escala ACL-RSI)']),
      P('Entrenamiento colectivo', ['Integración gradual sin restricciones'], ['Empezar sin contacto, después contacto controlado', 'Programa de prevención (tipo FIFA 11+) y fuerza de mantenimiento'], ['Varias semanas de entrenamiento completo sin derrame ni dolor', 'Decisión compartida con el cirujano']),
      P('Competición y seguimiento', ['Volver a competir', 'Prevenir nueva lesión'], ['Minutos progresivos', 'Mantener fuerza y prevención al menos durante la temporada'], ['Partido completo sin síntomas'], 'El riesgo de nueva lesión (injerto o rodilla contraria) es elevado, sobre todo en jóvenes.'),
    ],
    refs: [
      { t: 'Kotsifaki et al. 2023 · Aspetar clinical practice guideline on rehabilitation after ACL reconstruction (BJSM)', u: 'https://pmc.ncbi.nlm.nih.gov/articles/pmid/36731908' },
      { t: 'Waldén & Ardern · Decision-making for the football player with ACL injury (Aspetar)', u: 'https://www.aspetar.com/Journal/viewarticle.aspx?id=404' },
      { t: 'Figueroa et al. 2022 · Return to sport soccer after ACL reconstruction: ISAKOS consensus', u: 'https://repositori.upf.edu/items/ec58f673-a66e-4d48-ba4b-6a8529353373/full' },
    ],
  },
  {
    key: 'menisco', name: 'Lesión de menisco', short: 'Menisco', zone: 'Rodilla', region: 'Rodilla', type: 'Articular', icon: '🦿',
    gradeLabel: 'Tratamiento', grades: [
      { v: 'Meniscectomía parcial', days: [45, 64], ref: '1,5–2,1 meses de media' }, { v: 'Sutura (reparación)', days: [131, 176], ref: '4,3–5,8 meses de media' }, { v: 'Tratamiento conservador' }],
    timeNote: 'Tiempo medio de vuelta al deporte tras cirugía: futbolistas profesionales (1,5 meses y 4,3–5,5 meses) y metaanálisis en deportistas (2,1 y 5,8 meses). La sutura tarda más pero protege la rodilla a largo plazo.',
    mechs: ['Giro con el pie apoyado', 'Sentadilla profunda / flexión forzada', 'Con contacto', 'Otro'],
    questions: [
      { id: 'm_side', q: 'Menisco afectado', type: 'opt', options: ['Interno (medial)', 'Externo (lateral)', 'Ambos', 'No se sabe'], flag: ['Externo (lateral)'], flagText: 'Menisco externo: suele requerir más tiempo y cautela.' },
      { id: 'm_surg', q: 'Fecha de la cirugía (si la hay)', type: 'date' },
      { id: 'm_lock', q: '¿Bloqueos, chasquidos o fallos de la rodilla?', type: 'yn', flag: ['Sí'], flagText: 'Bloqueos o fallos: comunicar al médico.' },
      { id: 'm_eff', q: '¿Hay derrame?', type: 'opt', options: ['No', 'Leve', 'Moderado o importante'], flag: ['Moderado o importante'], flagText: 'Derrame: ajustar la carga hasta controlarlo.' },
      { id: 'm_rest', q: 'Restricciones del cirujano (carga, flexión máxima, plazos)', type: 'text' },
    ],
    phases: [
      P('Protección y control del derrame', ['Controlar dolor y derrame', 'Extensión completa'], ['Activación de cuádriceps, movilidad según restricciones', 'Carga según indicación (más limitada si hay sutura)'], ['Sin derrame o derrame mínimo', 'Extensión completa', 'Marcha normal']),
      P('Movilidad y fuerza básica', ['Recuperar flexión y fuerza'], ['Bici, prensa y sentadilla en rango permitido', 'Equilibrio'], ['Flexión según lo permitido', 'Sentadilla bilateral sin dolor']),
      P('Fuerza y control', ['Fuerza unilateral y control'], ['Fuerza unilateral, saltos bilaterales progresivos', 'Inicio de carrera'], ['Fuerza ≥ 80 % del lado sano', 'Carrera sin derrame posterior']),
      P('Tareas específicas', ['Giros, cambios de dirección, gestos de fútbol'], ['Cambios de dirección progresivos, balón'], ['Fuerza y saltos ≥ 90 % (LSI)', 'Giros sin dolor ni derrame']),
      P('Entrenamiento colectivo', ['Integración gradual'], ['Sesiones completas'], ['Varias sesiones sin derrame ni dolor']),
      P('Competición y seguimiento', ['Volver a competir'], ['Minutos progresivos'], ['Partido completo sin síntomas']),
    ],
    refs: [
      { t: 'Metaanálisis 2024 · Return to sport after meniscectomy, meniscal repair and allograft transplantation', u: 'https://susi.usi.ch/usi/documents/335512' },
      { t: 'Kalifis et al. 2022 · Meniscus tears in professional soccer athletes: resect or repair?', u: 'https://doaj.org/article/04420798572f472d922bcb0444ee108d' },
    ],
  },
  {
    key: 'lcm', name: 'Esguince del ligamento colateral medial (LCM)', short: 'LCM', zone: 'Rodilla', region: 'Rodilla', type: 'Ligamentosa', icon: '🦿',
    gradeLabel: 'Grado clínico', grades: [{ v: 'Grado I', days: [10, 10], ref: 'media 10 días' }, { v: 'Grado II', days: [12, 52], ref: '31,5 ± 20 días sin órtesis · 41,5 ± 13 con órtesis' }, { v: 'Grado III' }],
    timeNote: 'Estudio UEFA en futbolistas profesionales: el LCM es la lesión traumática de rodilla más frecuente, con unos 23–24 días de baja de media.',
    mechs: ['Golpe en la cara externa de la rodilla (valgo)', 'Sin contacto', 'Otro'],
    questions: [
      { id: 'mc_inst', q: '¿Sensación de inestabilidad?', type: 'yn', flag: ['Sí'], flagText: 'Inestabilidad: descartar lesiones asociadas (LCA, menisco).' },
      { id: 'mc_assoc', q: '¿Se han descartado lesiones asociadas (LCA, menisco)?', type: 'opt', options: ['Sí', 'No', 'Pendiente de prueba'], flag: ['No', 'Pendiente de prueba'], flagText: 'Lesiones asociadas sin descartar.' },
      { id: 'mc_brace', q: '¿Lleva rodillera u órtesis?', type: 'yn' },
      { id: 'mc_loc', q: 'Zona de dolor', type: 'opt', options: ['Inserción femoral (arriba)', 'Parte media', 'Inserción tibial (abajo)'], flag: ['Inserción tibial (abajo)'], flagText: 'Lesión distal (tibial): suele tardar más.' },
    ],
    phases: [
      P('Protección', ['Controlar dolor', 'Movilidad'], ['Movilidad activa, activación de cuádriceps', 'Evitar estrés en valgo'], ['Camina sin dolor', 'Extensión completa']),
      P('Movilidad y fuerza básica', ['Flexión completa y fuerza'], ['Bici, sentadilla, prensa, puentes'], ['Flexión completa', 'Sin dolor al estrés en valgo suave']),
      P('Fuerza y control', ['Fuerza unilateral y control'], ['Zancadas, saltos bilaterales, carrera lineal'], ['Fuerza ≥ 90 % del lado sano', 'Carrera sin dolor']),
      P('Tareas específicas', ['Cambios de dirección y golpeo con interior'], ['Desplazamientos laterales, pase con interior progresivo'], ['Cambios de dirección y golpeo con interior sin dolor']),
      P('Entrenamiento colectivo', ['Integración gradual'], ['Sesiones completas'], ['Varias sesiones sin síntomas']),
      P('Competición y seguimiento', ['Volver a competir'], ['Minutos progresivos'], ['Partido completo sin síntomas']),
    ],
    refs: [
      { t: 'Lundblad et al. 2019 · MCL injuries in male professional football: 130 cases from the UEFA Elite Club Injury Study (KSSTA)', u: 'https://link.springer.com/10.1007/s00167-019-05491-6' },
      { t: 'Lundblad et al. · The UEFA injury study: 11-year data concerning 346 MCL injuries (BJSM)', u: 'https://bjsm.bmj.com/lookup/ijlink/YTozOntzOjQ6InBhdGgiO3M6MTQ6Ii9sb29rdXAvaWpsaW5rIjtzOjU6InF1ZXJ5IjthOjQ6e3M6ODoibGlua1R5cGUiO3M6NDoiQUJTVCI7czoxMToiam91cm5hbENvZGUiO3M6ODoiYmpzcG9ydHMiO3M6NToicmVzaWQiO3M6OToiNDcvMTIvNzU5IjtzOjQ6ImF0b20iO3M6MjU6Ii9ianNwb3J0cy81NS8xOS8xMDg0LmF0b20iO31zOjg6ImZyYWdtZW50IjtzOjA6IiI7fQ==' },
    ],
  },
  {
    key: 'tobillo', name: 'Esguince lateral de tobillo', short: 'Esguince de tobillo', zone: 'Tobillo', region: 'Tobillo y pie', type: 'Ligamentosa', icon: '🦶',
    gradeLabel: 'Grado', grades: [{ v: 'Grado I' }, { v: 'Grado II' }, { v: 'Grado III' }, { v: 'Sin clasificar' }],
    timeNote: 'En clubes alemanes, los futbolistas profesionales tardaron de media unos 15,5 días y los de cantera unos 33 días. La recaída ronda el 17 % en futbolistas de élite.',
    mechs: ['Inversión (pie hacia dentro)', 'Pisotón / contacto', 'Otro'],
    questions: [
      { id: 't_wb', q: '¿Pudo apoyar y dar 4 pasos justo después?', type: 'yn', flag: ['No'], flagText: 'No pudo apoyar: aplicar las reglas de Ottawa / valorar radiografía para descartar fractura.' },
      { id: 't_prev', q: 'Esguinces previos en el mismo tobillo', type: 'opt', options: ['Ninguno', 'Uno', 'Dos o más'], flag: ['Dos o más'], flagText: 'Esguinces de repetición: valorar inestabilidad crónica y uso de tobillera.' },
      { id: 't_high', q: '¿Duele por encima del tobillo (entre tibia y peroné)?', type: 'yn', flag: ['Sí'], flagText: 'Dolor alto: descartar lesión de la sindesmosis (tarda más).' },
      { id: 't_inst', q: '¿Sensación de inestabilidad o “fallos”?', type: 'yn', flag: ['Sí'], flagText: 'Sensación de inestabilidad: priorizar propiocepción y equilibrio.' },
      { id: 't_brace', q: '¿Usa vendaje o tobillera?', type: 'opt', options: ['No', 'Vendaje', 'Tobillera'] },
    ],
    phases: [
      P('Control de dolor e inflamación', ['Apoyo progresivo'], ['Movilidad activa, carga según tolerancia', 'Vendaje o tobillera si se pauta', 'Breve inmovilización solo si lo indica el médico'], ['Camina sin cojera', 'Inflamación controlada']),
      P('Movilidad y fuerza básica', ['Recuperar flexión dorsal', 'Fuerza de peroneos y gemelos'], ['Movilidad en carga (rodilla a la pared)', 'Elevaciones de talón, gomas', 'Equilibrio unipodal'], ['Flexión dorsal (WBLT) similar al lado sano', 'Elevaciones a una pierna sin dolor']),
      P('Propiocepción y saltos', ['Control neuromuscular'], ['Equilibrio con perturbaciones, Y-Balance', 'Saltos bilaterales → unilaterales', 'Carrera lineal'], ['Y-Balance ≥ 90 % del lado sano', 'Saltos a una pierna sin dolor']),
      P('Tareas específicas', ['Cambios de dirección y gestos de fútbol'], ['Cambios de dirección, giros, balón'], ['Sin dolor durante el deporte ni en las últimas 24 h', 'Percepción de estabilidad del jugador']),
      P('Entrenamiento colectivo', ['Integración gradual'], ['Sesiones completas', 'Mantener propiocepción'], ['Varias sesiones sin síntomas']),
      P('Competición y prevención', ['Volver a competir', 'Evitar recaídas'], ['Programa de equilibrio/propiocepción', 'Valorar tobillera para prevenir esguinces de repetición'], ['Partido completo sin síntomas'], 'Criterios de retorno PAASS: dolor, función del tobillo, percepción del jugador, control sensoriomotor y rendimiento deportivo.'),
    ],
    refs: [
      { t: 'Vuurberg et al. 2018 · Diagnosis, treatment and prevention of ankle sprains: evidence-based guideline (BJSM)', u: 'https://research.vu.nl/en/publications/diagnosis-treatment-and-prevention-of-ankle-sprains-update-of-an-/' },
      { t: 'Smith et al. 2021 · Return to sport after lateral ankle sprain: the PAASS framework (BJSM)', u: 'https://pubmed.ncbi.nlm.nih.gov/34158354/' },
      { t: 'Flore et al. 2025 · Time-loss and recurrence of lateral ankle sprains in male professional football (BMJ Open SEM)', u: 'https://kar.kent.ac.uk/109053' },
    ],
  },
  {
    key: 't_rotuliana', name: 'Tendinopatía rotuliana', short: 'Tendinopatía rotuliana', zone: 'Rodilla (tendón rotuliano)', region: 'Rodilla', type: 'Tendinosa', icon: '🦿',
    gradeLabel: 'Irritabilidad', grades: [{ v: 'Baja' }, { v: 'Moderada' }, { v: 'Alta (muy reactiva)' }],
    timeNote: 'Sin plazos fijos: se progresa por etapas según el dolor durante y después de la carga.',
    mechs: ['Sobrecarga (saltos, aceleraciones)', 'Cambio brusco de carga', 'Otro'],
    questions: [
      { id: 'tr_time', q: 'Tiempo con síntomas', type: 'opt', options: ['Menos de 6 semanas', '6 semanas – 3 meses', 'Más de 3 meses'] },
      { id: 'tr_sit', q: '¿Duele al estar mucho tiempo sentado con la rodilla doblada?', type: 'yn' },
      { id: 'tr_decl', q: 'Dolor en sentadilla a una pierna en plano inclinado (0–10)', type: 'num', min: 0, max: 10, why: 'Sirve como test de seguimiento de la carga.' },
      { id: 'tr_inj', q: '¿Ha recibido infiltraciones u otros tratamientos?', type: 'text' },
      { id: 'tr_visa', q: 'Puntuación VISA-P (si se ha pasado)', type: 'num', min: 0, max: 100 },
    ],
    phases: [
      P('Etapa 1 · Isométricos', ['Reducir el dolor'], ['Isométricos de cuádriceps mantenidos, a diario, con efecto analgésico', 'Reducir saltos y aceleraciones'], ['Dolor ≤ 3/10 en ejercicios isotónicos']),
      P('Etapa 2 · Fuerza isotónica', ['Fuerza pesada y lenta'], ['Prensa, extensión de rodilla, sentadilla con carga alta y ejecución lenta, días alternos'], ['Fuerza adecuada y dolor mínimo con la carga', 'Tolera sentadilla a una pierna']),
      P('Etapa 3 · Almacenamiento de energía', ['Tolerar saltos'], ['Saltos progresivos en volumen e intensidad, carrera'], ['Tolera saltos y carrera sin aumento de dolor al día siguiente']),
      P('Etapa 4 · Retorno al deporte', ['Cargas que reproducen el fútbol'], ['Aceleraciones, cambios de dirección, golpeo, saltos'], ['Tolera la carga de entrenamiento sin empeorar al día siguiente']),
      P('Entrenamiento colectivo', ['Integración gradual'], ['Entreno completo controlando la carga semanal', 'Mantener fuerza 2 días/semana'], ['Dolor estable o descendente durante varias semanas']),
      P('Competición y mantenimiento', ['Competir y evitar recaídas'], ['Seguimiento del dolor con un test de referencia (p. ej. sentadilla declinada)'], ['Compite sin aumento de síntomas']),
    ],
    refs: [
      { t: 'Malliaras, Cook, Purdam & Rio 2015 · Patellar tendinopathy: clinical diagnosis, load management… (JOSPT)', u: 'https://nismat.org/education/injury-evaluation-and-treatment/lower-body/patellar-tendinopathy/' },
      { t: 'Physiopedia · Patellar tendinopathy (heavy slow resistance, estadios de Cook & Purdam)', u: 'https://www.physio-pedia.com/Patellar_Tendinopathy' },
    ],
  },
  {
    key: 't_aquiles', name: 'Tendinopatía aquílea', short: 'Tendinopatía de Aquiles', zone: 'Tendón de Aquiles', region: 'Tobillo y pie', type: 'Tendinosa', icon: '🦶',
    gradeLabel: 'Localización', grades: [{ v: 'Porción media del tendón' }, { v: 'Inserción (en el talón)' }, { v: 'No se sabe' }],
    timeNote: 'Programa de 12 semanas a 6 meses guiado por el modelo de monitorización del dolor: se puede seguir entrenando si el dolor no supera 5/10 y se recupera a la mañana siguiente.',
    mechs: ['Sobrecarga progresiva', 'Cambio de superficie, calzado o intensidad', 'Otro'],
    questions: [
      { id: 'ta_morn', q: '¿Rigidez o dolor por la mañana?', type: 'opt', options: ['No', 'Menos de 30 min', 'Más de 30 min'], flag: ['Más de 30 min'], flagText: 'Rigidez matinal prolongada: tendón irritable, empezar con carga baja.' },
      { id: 'ta_time', q: 'Tiempo con síntomas', type: 'opt', options: ['Menos de 6 semanas', '6 semanas – 3 meses', 'Más de 3 meses'] },
      { id: 'ta_heel', q: 'Elevaciones de talón a una pierna sin dolor (n.º)', type: 'num', min: 0, max: 100 },
      { id: 'ta_visa', q: 'Puntuación VISA-A (si se ha pasado)', type: 'num', min: 0, max: 100 },
    ],
    phases: [
      P('Fase 1 · Inicio y educación', ['Empezar a cargar', 'Entender el modelo del dolor'], ['Elevaciones de talón bilaterales, isométricos', 'Dolor permitido durante el ejercicio ≤ 5/10'], ['Dolor ≤ 5/10 y vuelve a su nivel a la mañana siguiente', 'Rigidez matinal sin empeorar']),
      P('Fase 2 · Fuerza', ['Fuerza de gemelo y sóleo'], ['Elevaciones a una pierna, con escalón y con rodilla doblada', 'Carrera suave si el dolor lo permite'], ['Elevaciones a una pierna con dolor controlado']),
      P('Fase 3 · Fuerza pesada y pliometría', ['Carga alta y saltos'], ['Elevaciones con carga, saltitos y comba progresivos'], ['Tolera saltos sin aumento de dolor ni rigidez matinal']),
      P('Fase 4 · Carga específica', ['Gestos de fútbol'], ['Aceleraciones, sprints, cambios de dirección'], ['Tolera la carga del entrenamiento']),
      P('Entrenamiento colectivo', ['Integración gradual'], ['Entreno completo controlando la carga', 'Mantener fuerza 2–3 días/semana'], ['Síntomas estables varias semanas']),
      P('Competición y mantenimiento', ['Competir y prevenir recaídas'], ['Mantener el programa de fuerza'], ['Compite sin aumento de síntomas']),
    ],
    refs: [
      { t: 'Silbernagel et al. 2007 · Continued sports activity, using a pain-monitoring model, in Achilles tendinopathy (AJSM)', u: 'https://myorthoevidence.com/AceReport/Report/850' },
      { t: 'Physiopedia · Achilles tendinopathy toolkit: exercise programs (protocolo de Silbernagel)', u: 'https://www.physio-pedia.com/Achilles_Tendinopathy_Toolkit:_Section_D_-_Exercise_Programs' },
    ],
  },
  {
    key: 'femoropatelar', name: 'Dolor femoropatelar', short: 'Dolor femoropatelar', zone: 'Rodilla (cara anterior)', region: 'Rodilla', type: 'Sobrecarga', icon: '🦿',
    gradeLabel: null, grades: [],
    timeNote: 'Sin plazos fijos. El consenso internacional recomienda ejercicio de cadera y rodilla combinado, mejor que ejercicio solo de rodilla.',
    mechs: ['Sobrecarga progresiva', 'Cambio de carga', 'Otro'],
    questions: [
      { id: 'pf_act', q: '¿Qué actividades le provocan dolor?', type: 'multi', options: ['Escaleras', 'Sentadilla', 'Correr', 'Saltar', 'Estar mucho rato sentado'] },
      { id: 'pf_time', q: 'Tiempo con síntomas', type: 'opt', options: ['Menos de 6 semanas', '6 semanas – 3 meses', 'Más de 3 meses'] },
      { id: 'pf_swell', q: '¿Hay inflamación o derrame?', type: 'yn', flag: ['Sí'], flagText: 'Derrame: no es típico del dolor femoropatelar, consultar con el médico.' },
    ],
    phases: [
      P('Control de síntomas', ['Reducir dolor', 'Educación sobre la carga'], ['Ajustar actividades dolorosas', 'Isométricos de cuádriceps y glúteo'], ['Dolor ≤ 3/10 en la vida diaria']),
      P('Fuerza de cadera y rodilla', ['Fuerza combinada'], ['Abductores y rotadores de cadera, sentadilla, prensa, step'], ['Sentadilla y escaleras con dolor mínimo']),
      P('Fuerza y control', ['Control en apoyo unipodal'], ['Sentadilla a una pierna, zancadas, saltos bilaterales, carrera'], ['Sentadilla a una pierna con buen control', 'Carrera sin dolor']),
      P('Tareas específicas', ['Gestos de fútbol'], ['Saltos, aceleraciones, cambios de dirección'], ['Sin aumento de dolor al día siguiente']),
      P('Entrenamiento colectivo', ['Integración gradual'], ['Entreno completo y fuerza de mantenimiento'], ['Síntomas estables']),
      P('Competición y mantenimiento', ['Competir'], ['Mantener fuerza de cadera y rodilla'], ['Compite sin síntomas']),
    ],
    refs: [{ t: 'Crossley et al. 2016 · Patellofemoral pain consensus statement, part 2: physical interventions (BJSM)', u: 'https://repub.eur.nl/pub/97316' }],
  },
];

export const OTHER = { key: 'otra', name: 'Otra lesión', short: 'Otra lesión', zone: '', region: 'Otras', type: '', icon: '➕', gradeLabel: 'Gravedad', grades: [{ v: 'Leve' }, { v: 'Moderada' }, { v: 'Grave' }], mechs: ['Sin contacto', 'Con contacto', 'Sobrecarga', 'Otro'], questions: [], phases: [], refs: [] };

export const byKey = k => CATALOG.find(c => c.key === k) || (k === 'otra' ? OTHER : null);
export const REGIONS = [...new Set(CATALOG.map(c => c.region))];
export const CONTEXTS = ['Partido', 'Entrenamiento', 'Fuera del club'];
export const TISSUES = ['Muscular', 'Ligamentosa', 'Tendinosa', 'Articular', 'Ósea', 'Contusión', 'Sobrecarga', 'Otra'];
export const ICONS = { 'Muslo': '🦵', 'Pierna': '🦶', 'Cadera e ingle': '🦴', 'Rodilla': '🦿', 'Tobillo y pie': '🦶', 'Tronco y espalda': '🧍', 'Miembro superior': '💪', 'Cabeza': '🧠', 'Otras': '🩹' };
export const ALL_REGIONS = [...REGIONS, 'Tronco y espalda', 'Miembro superior', 'Cabeza', 'Otras'];

// Plazo orientativo (solo si el grado tiene datos publicados)
export function estimate(inj) {
  const c = byKey(inj.catalog_key);
  const g = c?.grades.find(x => x.v === inj.grade);
  if (!g?.days) return null;
  const add = n => { const d = new Date(inj.injury_date + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  return { from: add(g.days[0]), to: add(g.days[1]), days: g.days, ref: g.ref };
}

// Preguntas de anamnesis aplicables
export const questionsFor = key => [...GENERAL_Q, ...(byKey(key)?.questions || [])];

// Puntos clave a partir de las respuestas
export function keyPoints(key, ans = {}) {
  const out = [];
  for (const q of questionsFor(key)) {
    const a = ans[q.id];
    if (a === undefined || a === null || a === '') continue;
    if (q.flag && (Array.isArray(a) ? a.some(x => q.flag.includes(x)) : q.flag.includes(a))) out.push({ id: q.id, text: q.flagText });
    if (q.flagMin !== undefined && Number(a) >= q.flagMin) out.push({ id: q.id, text: q.flagText });
  }
  return out;
}
export function answered(key, ans = {}) {
  const qs = questionsFor(key);
  const n = qs.filter(q => { const a = ans[q.id]; return a !== undefined && a !== null && a !== '' && !(Array.isArray(a) && !a.length); }).length;
  return { n, total: qs.length };
}
