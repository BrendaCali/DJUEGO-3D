# Dino Escape (prototipo)

Rompecabezas de construcción de caminos con nueve niveles. React + TypeScript + CSS, arte 100 % SVG propio.
**Prototipo: recompensas de prueba.** No hay contratos, billeteras, transacciones ni dinero real; todo saldo es «DINO de prueba».

## Ejecutar

```bash
npm install
npm run dev        # http://localhost:5173
```

```bash
npm run validate   # simula la solución de referencia de los 9 niveles + pruebas del motor y las recompensas
npm run build      # comprobación de tipos + build de producción
```

Modo desarrollo (abre cualquier nivel, botón «Colocar solución» y solución en JSON): activarlo en Ajustes ⚙ o abrir `http://localhost:5173/?dev=1`.
Con el modo desarrollo activo, `?dev=1&time=15` acorta el cronómetro para probar la derrota por bombas.

## Dónde editar

| Qué | Archivo |
|---|---|
| Niveles: tablero, tiempo, inventario, piedras, salidas/refugios, portales, piezas fijas y ruta de referencia | `src/levels/levelData.ts` |
| Cómo se deriva la solución de la ruta | `src/levels/builder.ts` |
| Premio máximo, penalización, meta de temporada, fondo simulado | `src/rewards/rewardRules.ts` (`REWARD_CONFIG`) |
| Reglas del recorrido, choques, portales, puentes | `src/game/engine.ts` |
| Estado de la partida (cronómetro, edición, deshacer, bombas) | `src/game/session.ts` |
| Velocidad de los dinos | `TICK_SEC` en `src/game/engine.ts` (0,5 s por casilla) |

Cada nivel se escribe con una **ruta de referencia** (puntos de paso). De ella se generan las piezas de la solución
(rectas, curvas, puentes donde la ruta se cruza), y `npm run validate` la simula con el motor real:
comprueba que llega a los refugios y que no usa más piezas que el inventario. Un nivel no se puede publicar sin que pase esa validación.
Las piedras repartidas (`scatter`) usan una semilla fija y nunca tocan la ruta.

`inventory` es `[rectas, curvas, cruces en T, puentes]`. `teeArrow` (`stem`, `left`, `right`) decide hacia dónde apunta la flecha de las T de ese nivel.

## Separación de la lógica de recompensas

`src/rewards/rewardRules.ts` no importa nada del juego. El juego solo le entrega tiempo restante, tiempo total e intentos fallidos
(`applyCompletion`). Para integrar un sistema real basta con reemplazar ese módulo conservando `pendingReward`, `applyCompletion` y `communitySnapshot`.

## Controles

Elegir pieza → clic en casilla (o arrastrar en escritorio) · `Q`/`R` girar · `X` o clic derecho recuperar · `Ctrl+Z` deshacer · `1–4` elegir pieza · `Esc` soltar.
En tableros grandes: zoom `−`/`+`, «Ajustar», «✋ Mover vista» (arrastrar sin colocar piezas) y flechas de desplazamiento.
