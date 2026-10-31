import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { GAME } from '@colomba/shared';
import { exec, one } from '../db.js';
import { requireActiveUser, requireUser } from '../lib/auth.js';
import { notFound } from '../lib/errors.js';
import { acquireCourier, buySlot, catalogFor, ownedCouriers, ownedTariffs, questsDone, releaseCourier } from '../services/couriers.js';

export async function courierRoutes(app: FastifyInstance): Promise<void> {
  /** Курьеры пользователя: дома, в пути, ждут ответа, возвращаются. */
  app.get('/', async (req) => {
    const u = requireUser(req);
    const rows = await ownedCouriers(u.id);
    return {
      slots: u.slots,
      maxSlots: GAME.maxSlots,
      nextSlotPrice: u.slots < GAME.maxSlots ? GAME.slotPrice(u.slots + 1) : null,
      tariffs: await ownedTariffs(u.id),
      couriers: rows.map((c) => ({
        id: c.id,
        type: c.type_code,
        name: c.name,
        trips: c.trips,
        km: Math.round(c.km_total),
        status: c.status,
        tripId: c.current_trip_id,
        tripStartAt: c.trip_start_at,
        tripEndAt: c.trip_end_at,
        waitingLetterId: c.waiting_letter_id,
        waitingUntil: c.waiting_until,
        speedBonus: Math.min(GAME.maxExperienceBonus, c.trips * GAME.experiencePerTrip),
      })),
    };
  });

  /** Каталог: четыре раздела, открытые и закрытые, задания. */
  app.get('/catalog', async (req) => {
    const u = requireUser(req);
    const cat = await catalogFor(u.id);
    const quests = await questsDone(u.id);
    return {
      quests: [...quests],
      items: cat.map(({ type, state, count }) => ({ ...type, state, count })),
    };
  });

  app.post('/', async (req) => {
    const u = requireActiveUser(req);
    const b = z.object({ type: z.string().max(32), name: z.string().max(40).optional() }).parse(req.body);
    return { id: await acquireCourier(u.id, b.type, b.name, u.lang) };
  });

  /** Владелец даёт курьеру имя («Василий»). */
  app.patch('/:id', async (req) => {
    const u = requireUser(req);
    const { id } = z.object({ id: z.coerce.number() }).parse(req.params);
    const b = z.object({ name: z.string().min(1).max(40) }).parse(req.body);
    const res = await exec('UPDATE couriers SET name = ? WHERE id = ? AND owner_id = ?', [b.name.trim(), id, u.id]);
    if (res.affectedRows !== 1) throw notFound();
    return { ok: true };
  });

  app.delete('/:id', async (req) => {
    const u = requireUser(req);
    const { id } = z.object({ id: z.coerce.number() }).parse(req.params);
    await releaseCourier(u.id, id);
    return { ok: true };
  });

  app.post('/slots', async (req) => {
    const u = requireActiveUser(req);
    return { slots: await buySlot(u.id) };
  });

  /** Текущий рейс курьера (для владельца): шкала, по которой карта двигает курьера. */
  app.get('/:id/trip', async (req) => {
    const u = requireUser(req);
    const { id } = z.object({ id: z.coerce.number() }).parse(req.params);
    const c = await one<any>('SELECT * FROM couriers WHERE id = ? AND owner_id = ?', [id, u.id]);
    if (!c || !c.current_trip_id) throw notFound('no_trip');
    const t = await one<any>('SELECT * FROM trips WHERE id = ?', [c.current_trip_id]);
    if (!t) throw notFound('no_trip');
    return {
      id: t.id, direction: t.direction, purpose: t.purpose, startAt: t.start_at, endAt: t.end_at,
      timeline: JSON.parse(t.timeline), distanceKm: t.distance_km, letterId: t.letter_id,
    };
  });
}
