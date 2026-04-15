import { db, firebase } from '../../firebase';

function sanitizeHabit(habit) {
  const rawHistory = habit?.history && typeof habit.history === 'object' ? habit.history : {};
  const history = Object.fromEntries(
    Object.entries(rawHistory)
      .filter(([k, v]) => typeof k === 'string' && !!k && !!v)
      .map(([k]) => [k, true])
  );
  return {
    id: String(habit?.id || ''),
    title: String(habit?.title || 'Untitled'),
    createdAt: habit?.createdAt || new Date().toISOString(),
    history,
  };
}

export class HabitRepository {
  constructor(userId) {
    this.userId = userId;
  }

  habitsDocRef() {
    return db.collection('users').doc(this.userId).collection('habbits').doc('data');
  }

  async loadHabbits() {
    try {
      const doc = await this.habitsDocRef().get();
      if (!doc.exists) return [];
      const data = doc.data() || {};
      const items = Array.isArray(data.items) ? data.items : [];
      return items.map(sanitizeHabit).filter((h) => !!h.id);
    } catch (error) {
      if (error?.code === 'permission-denied' || error?.code === 'not-found') return [];
      throw error;
    }
  }

  async saveHabbits(items) {
    const safeItems = (Array.isArray(items) ? items : []).map(sanitizeHabit).filter((h) => !!h.id);
    await this.habitsDocRef().set(
      {
        ownerUid: this.userId,
        items: safeItems,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }
}

export const createHabitRepository = (userId) => new HabitRepository(userId);
