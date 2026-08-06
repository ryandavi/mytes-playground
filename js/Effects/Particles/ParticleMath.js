// Thin aliases over the shared Utility helpers — kept so particle code reads
// in its own vocabulary, but with a single implementation underneath.
class ParticleMath {
    static FRAME_MS = 1000 / 60;

    static clamp(value, min, max) {
        return Utility.clamp(value, min, max);
    }

    static lerp(start, end, amount) {
        return Utility.lerp(start, end, amount);
    }

    static inverseLerp(start, end, value) {
        return Utility.inverseLerp(start, end, value);
    }

    static wrap(value, min, max) {
        return Utility.wrap(value, min, max);
    }
}
