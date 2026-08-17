# Open Beat

![img.png](img.png)

Open Beat es una aplicación de DJ moderna e inteligente que utiliza tecnologías de inteligencia artificial para mejorar la experiencia de mezcla de música. La aplicación ofrece análisis de audio avanzado, detección de BPM, transiciones inteligentes entre canciones y más.

## Características

- **Auto-DJ profesional**: mezcla automática al estilo de los sistemas avanzados de DJ
  - **Análisis musical completo** en un Web Worker (sin congelar la interfaz): BPM con precisión de centésimas, cuadrícula de beats y compases (beatgrid + downbeats), tonalidad musical por cromagrama (perfiles Krumhansl-Schmuckler → rueda de Camelot), curva de energía, estructura (intro/outro/drops) y loudness
  - **Beatmatching real**: sincroniza el tempo del siguiente track con `playbackRate` (con master tempo, sin cambiar el tono) y un *phase-lock* continuo que micro-ajusta la fase de los beats durante la mezcla, como un DJ con el jog wheel
  - **Mezcla armónica**: elige el siguiente track por compatibilidad de tonalidad (rueda de Camelot), tempo y energía
  - **Transiciones planificadas**: blend largo de 16/32 beats alineado a frases cuando los tempos son compatibles, o corte con filtro + echo-out cuando no lo son; el punto de salida se alinea al inicio del outro detectado, sobre un downbeat
  - **Bass swap**: intercambio de graves entre decks para que dos líneas de bajo nunca choquen
  - **Auto-gain**: iguala el loudness percibido entre tracks automáticamente
- **Interfaz de DJ intuitiva**: Carrusel de canciones y artistas, con BPM, tonalidad (Camelot) y energía de cada track
- **Análisis emocional**: Analiza el contenido emocional de la música
- **Gestión de metadatos**: Extrae y gestiona metadatos de archivos de música (tags ID3, carátulas embebidas)
- **Biblioteca local**: lee la música de `src/assets/music` (ver el README de esa carpeta)

## Tecnologías utilizadas

- **Frontend**: Angular 20
- **Estilos**: Tailwind CSS
- **Audio**:
  - Howler.js para reproducción de audio
  - Tone.js para síntesis y procesamiento de audio
  - Music-metadata para análisis de metadatos
- **Inteligencia Artificial**:
  - TensorFlow.js para procesamiento de audio con IA
  - Magenta para generación y análisis musical
  - Essentia.js y Meyda para análisis de audio
  - ML-Matrix para operaciones matriciales

## Requisitos previos

- Node.js (versión 18 o superior)
- npm (versión 9 o superior)

## Instalación

1. Clona el repositorio:
   ```
   git clone https://github.com/tu-usuario/open-beat.git
   cd open-beat
   ```

2. Instala las dependencias:
   ```
   npm install
   ```

3. Inicia la aplicación en modo desarrollo:
   ```
   npm start
   ```

4. Abre tu navegador y visita `http://localhost:4200`

## Compilación para producción

Para compilar la aplicación para producción:

```
npm run build
```

Los archivos compilados se encontrarán en el directorio `dist/`.

## Pruebas

Para ejecutar las pruebas unitarias:

```
npm test
```

## Estructura del proyecto

- `src/app/dj/` - Componentes de la interfaz de DJ
- `src/app/home/` - Componentes de la página principal
- `src/app/services/` - Servicios para procesamiento de audio, análisis y reproducción
