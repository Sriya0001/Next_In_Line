# Next In Line — Architecture & Design Decisions

This document outlines the deliberate architectural choices made for the **Next In Line** automated recruitment pipeline.

## 1. System Design: Backend-Heavy, Minimal Frontend

By design, **Next In Line** is a backend-heavy system. The core value lies in the state machine, concurrency management, and automated cascade logic handled by the server. 

The frontend is intentionally **minimal**. It serves as a portal for two distinct users:
1.  **Company Administrators**: A dashboard to monitor the current pipeline state and audit logs.
2.  **Applicants**: A high-clarity status page to track their specific journey and position.

## 2. State Synchronization: Polling Strategy

A critical design requirement is that the system **does not need to be real-time**. We have made a deliberate choice to use **HTTP Polling** rather than persistent connections (WebSockets/SSE).

### Choice: 30-Second Polling Interval
- **Rationale:** Hiring events (applications, promotions, withdrawals) occur on human timescales. A 30-second window for state synchronization provides a "live enough" experience without the scaling and complexity overhead of WebSockets.
- **Minimal Complexity:** This choice aligns with the "Internal Tool" nature of the project—optimizing for robustness and ease of deployment over sub-second latency.
- **Fallbacks:** Every polling view includes a "Manual Refresh" button and a "Last Updated" timestamp for full transparency to the user.

## 3. Concurrency & Data Integrity

The backend ensures absolute data integrity through **PostgreSQL Serializable Transactions**. 
- Even if multiple applicants apply or are promoted simultaneously, the database serializes these operations to ensure no race conditions occur on slot capacity.
- **Cascade Logic:** All state transitions (Active -> Exit -> Promotion) are atomic. If a rejection occurs, the next in line is promoted within the same transaction.

## 4. Design Aesthetics

While minimal in architecture, the UI uses **Fluid Responsive Scaling** (via CSS `clamp()`) and a premium, high-contrast design system. This ensures the application is professional and accessible across mobile, tablet, and desktop displays.
