# Dino Escape — Prototipo (DINO de prueba)

Rompecabezas de caminos + duelos de dos jugadores + refugio comunitario financiado con parte de cada duelo.
**Todo es DINO de prueba**: sin contratos, billeteras, compras con USDT ni dinero real. Sin NFT ni promesas de rentabilidad.

## Ejecutar

```bash
npm install
npm run server     # servidor autoritativo (WebSocket, puerto 8787)
npm run dev        # cliente en http://localhost:5173 (proxy /ws -> 8787)
```

`npm start` compila el cliente y lo sirve junto al servidor en http://localhost:8787.
La práctica funciona sin servidor; duelos, refugio, evento y saldos lo necesitan
(en GitHub Pages solo se puede publicar el cliente, así que allí funciona la práctica).

Para probar con dos jugadores abre dos pestañas: `/?dev=1&as=Ana` y `/?dev=1&as=Beto` (cada `as` tiene su identidad de prueba).

## Verificar

```bash
npm run validate   # 9 niveles + variantes + reglas económicas del servidor (liquidaciones, devoluciones, evento)
npm run e2e        # duelo real de dos clientes contra el servidor en marcha
```

## Arquitectura

| Capa | Dónde | Qué hace |
|---|---|---|
| Motor del juego | `src/game/` | Piezas, recorridos, colisiones, sesión de partida (sin React, compartido por cliente y servidor). |
| Niveles | `src/levels/` | Nueve niveles con solución de referencia; `variants.ts` crea variantes inéditas verificadas (semilla de piedras + giro). |
| Servidor | `server/` | `world.ts` (salas, refugio, evento, vistas), `ledger.ts` (libro de partida doble en enteros), `validate.ts` (verifica soluciones), `index.ts` (HTTP + WebSocket). |
| Interfaces NEAR | `server/ports.ts` | Contratos para sustituir identidad, saldos, bloqueo de partidas y tesorería. |
| Cliente | `src/ui/`, `src/net/` | Presenta y envía acciones; no decide ganadores ni importes. |

El servidor fija el inicio común, entrega el mismo tablero, reconstruye y simula cada solución enviada, mide el tiempo con su reloj y liquida cada partida una sola vez (`SET-<sala>`, `REF-<sala>`, `EV-<ciclo>`).

## Parámetros configurables

- `server/config.ts`: entrada (10), comisiones (2,5 % + 2,5 %), margen de empate (500 ms), espera de sala (5 min), meta del refugio (100 rescates / 50 DINO), premios del evento (25/15/10), plazos (24 h + 24 h), límites de frecuencia.
- `src/levels/levelData.ts`: niveles; `src/levels/variants.ts`: variantes.
- Importes en unidades mínimas: 1 DINO = 100 unidades.

## Modo desarrollo (`?dev=1`, requiere servidor en desarrollo)

Abre cualquier nivel, muestra soluciones, da saldo de prueba, **precarga el refugio a 99 rescates y 49,5 DINO** (rotulado como demostración) y acelera los plazos del evento.

## Límites conocidos

- Estado en memoria con volcado a `server/data/state.json`; las salas no sobreviven a un reinicio (se devuelven los aportes).
- La reconexión conserva el cronómetro y la sala, pero recargar la página borra el tablero a medio construir.
- Los controles (límite de envíos, tiempo mínimo plausible, registro de rechazos) detectan resultados imposibles; no eliminan bots ni ayuda automática.
- El intento único por cuenta del evento no protege contra múltiples cuentas.
