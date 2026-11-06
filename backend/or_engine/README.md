# OptimizeQL Operations Research (OR) Engine

Multi-objective query optimization engine using weighted scoring and integer linear programming.

## Modules

- `models.py`: Data definitions for objectives, metric vectors, scored alternatives, and index candidates.
- `objectives.py`: Measurable objectives (`execution_time`, `planner_cost`, `buffer_reads`, `buffer_hits`) and PostgreSQL EXPLAIN plan metric extraction.
- `scoring.py`: Min-max normalization and weighted-sum score computation.
- `index_selector.py`: 0-1 Binary Knapsack model for budget-constrained index selection using PuLP (CBC solver).
- `optimizer.py`: Orchestration pipeline translating LLM/catalog recommendations into ranked alternatives.

## Mathematical Formulation

See detailed documentation in `/Users/diksha/.gemini/antigravity/brain/fd48fa6d-bc5b-4ee1-a345-bb27ec50aace/operations_research_spec.md`.
