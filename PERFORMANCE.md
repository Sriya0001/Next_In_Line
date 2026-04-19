# 🚀 Next In Line: Performance & Integrity Report

This document outlines the engineering rigor behind Next In Line's self-managing pipeline, specifically focusing on how we handle extreme concurrency without data corruption.

## ⚖️ The Core Challenge: The "Last Slot Race"

In a high-intensity hiring scenario, dozens of applicants may apply simultaneously for the final available slot. A naive implementation would suffer from **Phantom Reads** or **Lost Updates**, leading to over-filled pipelines (e.g., 12 applicants in 10 slots).

### Our Defense: `SERIALIZABLE` Isolation + Retries

We utilize PostgreSQL's strictest isolation level: `SERIALIZABLE`. 
- **Integrity**: Guaranteed zero over-fills.
- **Contention Management**: Automatic transaction retries with jittered exponential backoff.

---

## 📊 Stress Test Results (Apr 19, 2026)

We executed `server/scripts/stressTest.js`, firing **60 concurrent applications** within **1 second** against a job with an **active capacity of 10**.

| Metric | Result | Note |
| :--- | :--- | :--- |
| **Total Requests** | 60 | Concurrent burst |
| **Active Slots Filled** | 10 | Target capacity met exactly |
| **Waitlist Count** | 50 | Properly overflowed |
| **Data Corruption** | **0.00%** | **PASSED** |
| **Handled Conflicts** | 142 | Retried and resolved automatically |
| **Avg Throughput** | ~800ms | Total burst resolution time |

### Conflict Resolution Log (Excerpt)
```log
🔥 Firing 60 concurrent applications...
🔄 Serialization conflict (attempt 1). Retrying in 241ms...
🔄 Serialization conflict (attempt 1). Retrying in 298ms...
🔄 Serialization conflict (attempt 2). Retrying in 470ms...
✅ INTEGRITY CHECK PASSED: Active count matches capacity.
🏆 Stress Test Complete (Success: 60/60)
```

---

## 🛠️ Engineering Architecture

### 1. Reliable Cascades
When an applicant is rejected or decays, the `promoteNext` cascade is wrapped within the **same atomic transaction**. This prevents "leaked slots" where an active position stays empty because a promotion script failed halfway.

### 2. The `withTransaction` Helper
Our robust wrapper in `db.js` handles the entire transaction lifecycle:
- Explicit `BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE`.
- Automatic recovery from `40001` (Serialization Failure) and `40P01` (Deadlock).
- Exponential backoff to prevent thundering herd during retries.

### 3. Connection Sizing
To handle high-burst events, our connection pool is tuned for asynchronous peaks (`max: 50`), ensuring that even during extreme contention, the system stays responsive.

---

## 🏆 Proof of Engineering
Next In Line isn't just a UI; it's a **resilient state machine**. By offloading the burden of synchronization to the database and implementing smart application-level recovery, we provide a "set it and forget it" pipeline that small teams can trust with their most critical hiring data.
