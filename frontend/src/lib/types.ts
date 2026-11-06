export interface ConnectionCreate {
  name: string;
  db_type: "postgresql" | "mysql";
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl_enabled: boolean;
}

export interface ConnectionResponse {
  id: string;
  name: string;
  db_type: string;
  host: string;
  port: number;
  database: string;
  username: string;
  ssl_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface ConnectionTestResult {
  success: boolean;
  message: string;
}

// ── Playground (client-provided introspection) ─────────────────────────────

export interface ClientExplainResult {
  raw_plan: string;
  planning_time_ms: number | null;
  execution_time_ms: number | null;
}

export interface ClientTableColumn {
  column_name: string;
  data_type: string;
  is_nullable: string;
  column_default: string | null;
  character_maximum_length?: number | null;
}

export interface ClientTableIndex {
  index_name: string;
  table_name: string;
  columns: string[];
  is_unique: boolean;
  index_type: string;
  definition: string;
}

export interface ClientColumnStat {
  column_name: string;
  null_frac: number;
  avg_width: number;
  n_distinct: number;
}

export interface ClientTableSchema {
  table_name: string;
  columns: ClientTableColumn[];
  row_count: number;
  indexes: ClientTableIndex[];
  column_stats: ClientColumnStat[];
}

export type AnalyzeMode = "connect" | "playground" | "none";

export interface AnalyzeRequest {
  sql: string;
  connection_id?: string | null;
  model?: string | null;
  client_explain?: ClientExplainResult | null;
  client_table_schemas?: ClientTableSchema[] | null;
  client_db_type?: string | null;
}

export interface SuggestionItem {
  sql: string | null;
  explanation: string;
  estimated_impact: "high" | "medium" | "low";
  plan_node?: string | null;
  root_cause?: string | null;
  index_type?: string | null;
}

export interface ConfigurationItem {
  parameter: string;
  current_value: string;
  recommended_value: string;
  explanation: string;
  estimated_impact: "high" | "medium" | "low";
}

export interface ConfidenceRange {
  min_ms: number;
  max_ms: number;
}

export interface ModelPredictions {
  random_forest_ms: number;
  xgboost_ms: number;
}

export interface ExecutionTimePrediction {
  predicted_time_ms: number;
  latency_tier: "fast" | "moderate" | "heavy";
  confidence_range: ConfidenceRange;
  models: ModelPredictions;
  features_summary: Record<string, unknown>;
  cost_factors: string[];
  model_version: string;
}

export interface AnalysisResult {
  query_id: string;
  indexes: SuggestionItem[];
  rewrites: SuggestionItem[];
  materialized_views: SuggestionItem[];
  bottlenecks: SuggestionItem[];
  statistics: SuggestionItem[];
  configuration: ConfigurationItem[];
  summary: string;
  explain_plan: string | null;
  explain_error?: string | null;
  tables_analyzed: string[];
  execution_time_prediction?: ExecutionTimePrediction | null;
  or_optimization?: OROptimizationSummary | null;
}

// ── Share Links ─────────────────────────────────────────────────────────────

export interface ShareLinkCreate {
  schema_ddl: string | null;
  sql_query: string;
  llm_response: string | null;
}

export interface ShareLinkResponse {
  id: string;
  schema_ddl: string | null;
  sql_query: string;
  llm_response: string | null;
  created_at: string;
}

// ── Query Comparison ────────────────────────────────────────────────────────

export interface CompareRequest {
  original_sql: string;
  rewritten_sql: string;
  connection_id: string;
  row_limit?: number;
}

export interface RowDiff {
  row_number: number;
  original_row: unknown[];
  rewritten_row: unknown[];
}

export interface CompareResult {
  results_match: boolean;
  /** True when rows are identical but returned in different order */
  order_differs?: boolean;
  rows_compared: number;
  original_row_count: number;
  rewritten_row_count: number;
  first_diff: RowDiff | null;
  original_error: string | null;
  rewritten_error: string | null;
}

// ── Index Simulation ───────────────────────────────────────────────────────

export interface SimulateIndexRequest {
  index_sql: string;
  query_sql: string;
  connection_id: string;
}

export interface PlanNodeChange {
  before: string;
  after: string;
  cost_before: number;
  cost_after: number;
}

export interface SimulateIndexResult {
  success: boolean;
  error: string | null;
  hypopg_available: boolean;
  original_cost: number | null;
  simulated_cost: number | null;
  cost_reduction_pct: number | null;
  original_plan: string | null;
  simulated_plan: string | null;
  node_changes: PlanNodeChange[];
}

// ── LLM Config ──────────────────────────────────────────────────────────────

export interface LLMConfigCreate {
  name: string;
  provider: "anthropic" | "openai" | "gemini" | "deepseek" | "xai" | "qwen" | "meta" | "kimi" | "groq" | "openrouter";
  api_key: string;
}

export interface LLMConfigResponse {
  id: string;
  name: string;
  provider: string;
  is_active: boolean;
  api_key_preview: string;
  created_at: string;
  updated_at: string;
}

export interface ProviderInfo {
  name: string;
  label: string;
  default_model: string;
  models: string[];
}

// ── Query History ───────────────────────────────────────────────────────────

export interface QueryHistoryItem {
  id: string;
  connection_id: string | null;
  sql_query: string;
  explain_plan?: string | null;
  execution_time_ms?: number | null;
  planning_time_ms?: number | null;
  is_benchmark?: boolean;
  llm_response: string | null;
  schema_ddl: string | null;
  created_at: string;
}

// ── Dashboard Stats ────────────────────────────────────────────────────────

export interface QueryByDate {
  date: string;
  count: number;
}

export interface CategoryCount {
  category: string;
  count: number;
}

export interface TableCount {
  table_name: string;
  count: number;
}

export interface RecentAnalysis {
  id: string;
  sql_query: string;
  suggestion_count: number;
  created_at: string;
  llm_response: string | null;
}

export interface DashboardStats {
  total_queries: number;
  total_suggestions: number;
  high_impact_count: number;
  streak_days: number;
  top_categories: CategoryCount[];
  most_analyzed_tables: TableCount[];
  queries_by_date: QueryByDate[];
  recent_analyses: RecentAnalysis[];
}

// ── Machine Learning ───────────────────────────────────────────────────────

export interface PredictTimeRequest {
  sql: string;
  connection_id?: string | null;
  table_row_estimates?: Record<string, number> | null;
  model?: "random_forest" | "xgboost" | null;
}

export interface MLModelInfo {
  status: string;
  models_available: string[];
  default_model: string;
  model_version: string;
  dataset_summary: {
    total_samples: number;
    real_samples: number;
    benchmark_samples: number;
  };
  splits: {
    train_count: number;
    val_count: number;
    test_count: number;
  };
  evaluation_metrics: Record<
    string,
    {
      mae_ms: number;
      rmse_ms: number;
      r2_score: number;
      accuracy_within_30pct: number;
    }
  >;
  trained_at?: string | null;
  features_used: string[];
}

// ── Operations Research Multi-Objective Optimization ─────────────────────────

export interface AlternativeMetrics {
  execution_time_ms?: number | null;
  planner_cost?: number | null;
  buffer_reads?: number | null;
  buffer_hits?: number | null;
  total_buffer_accesses?: number | null;
}

export interface NormalisedMetrics {
  execution_time?: number | null;
  planner_cost?: number | null;
  buffer_reads?: number | null;
  buffer_hits?: number | null;
  buffer_accesses?: number | null;
}

export interface ObjectiveScoreDetail {
  objective: string;
  original_value?: number | null;
  optimized_value?: number | null;
  direction: "minimize" | "maximize";
  normalized_penalty?: number | null;
  active_weight: number;
  weighted_contribution: number;
}

export interface ScoredAlternative {
  rank: number;
  category: string;
  sql?: string | null;
  explanation: string;
  estimated_impact: "high" | "medium" | "low";
  raw_metrics: AlternativeMetrics;
  normalised_metrics: NormalisedMetrics;
  weighted_score: number;
  score_breakdown: Record<string, number>;
  detailed_breakdown?: ObjectiveScoreDetail[];
  score_explanation: string;
  ml_predicted_time_ms?: number | null;
  is_ml_prediction: boolean;
}

export interface OROptimizationSummary {
  total_alternatives: number;
  weights_used: Record<string, number>;
  ranked_alternatives: ScoredAlternative[];
  algorithm: string;
}

export interface ObjectiveDefinition {
  name: string;
  description: string;
  unit: string;
  direction: "minimize" | "maximize";
  weight: number;
}

export interface OROptimizeRequest {
  sql: string;
  connection_id?: string | null;
  weights?: Record<string, number> | null;
  include_ml_prediction?: boolean;
  analysis_result_json?: string | null;
  explain_plan_json?: string | null;
}

export interface OROptimizeResponse {
  query_id: string;
  alternatives: ScoredAlternative[];
  weights_used: Record<string, number>;
  objectives: ObjectiveDefinition[];
  normalisation_method: string;
  scoring_algorithm: string;
  total_alternatives: number;
  ml_prediction_available: boolean;
}

export interface ORConfigResponse {
  default_weights: Record<string, number>;
  objectives: ObjectiveDefinition[];
  normalisation_method: string;
  scoring_algorithm: string;
}

export interface IndexCandidate {
  index_id: number;
  sql: string;
  explanation: string;
  estimated_size_bytes: number;
  estimated_cost_reduction: number;
  selected: boolean;
  is_estimated_size?: boolean;
  size_provenance?: string;
}

export interface IndexSelectionResult {
  solver_status: string;
  selected_indexes: IndexCandidate[];
  rejected_indexes: IndexCandidate[];
  total_size_bytes: number;
  budget_bytes: number;
  budget_utilisation_pct: number;
  objective_value: number;
  formulation: Record<string, unknown>;
}

export interface IndexSelectionRequest {
  sql: string;
  connection_id?: string | null;
  budget_mb?: number;
  analysis_result_json?: string | null;
}

export interface IndexSelectionResponse {
  query_id: string;
  result: IndexSelectionResult;
  budget_mb: number;
}

// ── Query Performance Benchmarking ───────────────────────────────────────────

export interface SingleRunTelemetry {
  run_index: number;
  is_cold: boolean;
  execution_time_ms: number;
  planning_time_ms?: number | null;
  planner_cost?: number | null;
  actual_rows?: number | null;
  buffer_reads?: number | null;
  buffer_hits?: number | null;
}

export interface AggregateBenchmarkMetrics {
  runs_count: number;
  cold_execution_time_ms?: number | null;
  warm_median_execution_time_ms: number;
  mean_execution_time_ms: number;
  std_dev_execution_time_ms: number;
  min_execution_time_ms: number;
  max_execution_time_ms: number;
  planning_time_ms?: number | null;
  estimated_planner_cost?: number | null;
  actual_rows?: number | null;
  shared_buffer_reads?: number | null;
  shared_buffer_hits?: number | null;
  cache_hit_ratio?: number | null;
  cache_state_provenance?: string;
  raw_runs: SingleRunTelemetry[];
}

export interface EquivalenceDiff {
  row_number: number;
  original_row: unknown[];
  optimized_row: unknown[];
}

export interface EquivalenceResult {
  results_match: boolean;
  rows_compared: number;
  original_row_count: number;
  optimized_row_count: number;
  first_diff?: EquivalenceDiff | null;
  original_error?: string | null;
  optimized_error?: string | null;
  is_bounded_check?: boolean;
  order_by_checked?: boolean;
  equivalence_note?: string;
}

export interface CachingAnalysis {
  cold_time_ms?: number | null;
  warm_median_time_ms: number;
  cache_speedup_factor?: number | null;
  cold_cache_hit_ratio?: number | null;
  warm_cache_hit_ratio?: number | null;
  caching_effect_summary: string;
}

export interface MLBenchmarkComparison {
  ml_predicted_time_ms: number;
  actual_measured_time_ms: number;
  prediction_error_ms: number;
  relative_error_pct: number;
  latency_tier_predicted: string;
  is_prediction_accurate_within_30pct: boolean;
  provenance_note: string;
}

export interface BenchmarkComparisonResult {
  benchmark_id: string;
  query_id?: string | null;
  original_sql: string;
  optimized_sql?: string | null;
  applied_index_sql?: string | null;
  environment: string;
  original_metrics: AggregateBenchmarkMetrics;
  optimized_metrics?: AggregateBenchmarkMetrics | null;
  equivalence?: EquivalenceResult | null;
  execution_time_improvement_pct?: number | null;
  planner_cost_improvement_pct?: number | null;
  buffer_read_improvement_pct?: number | null;
  caching_analysis: CachingAnalysis;
  ml_comparison?: MLBenchmarkComparison | null;
  created_at: string;
}

export interface BenchmarkRunRequest {
  original_sql: string;
  optimized_sql?: string | null;
  index_sql?: string | null;
  connection_id?: string | null;
  num_runs?: number;
  row_limit_for_equivalence?: number;
  save_to_history?: boolean;
}

export interface BenchmarkHistoryItem {
  id: string;
  connection_id?: string | null;
  original_sql: string;
  optimized_sql?: string | null;
  applied_index_sql?: string | null;
  environment: string;
  original_exec_time_ms: number;
  optimized_exec_time_ms?: number | null;
  exec_time_improvement_pct?: number | null;
  planner_cost_improvement_pct?: number | null;
  buffer_read_improvement_pct?: number | null;
  results_match?: boolean | null;
  created_at: string;
}
