export type CaseStatus =
  | 'uploaded'
  | 'analyzing'
  | 'awaiting-answers'
  | 'generating'
  | 'completed'
  | 'failed';

export type CaseType = 'penalty' | 'complaint';
export type Defensibility = '强' | '中' | '弱';
export type ComplaintType = '虚假宣传' | '质量问题' | '价格欺诈' | '售后纠纷' | '食品安全' | '其他';
export type ComplaintSource = '12315' | '12345' | '黑猫投诉' | '电商平台' | '其他';
export type EscalationRisk = 'high' | 'medium' | 'low';
export type RecommendedStrategy = 'cooperative' | 'negotiate' | 'defend';

export interface Case {
  id: string;
  case_type: CaseType;
  status: CaseStatus;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface Analysis {
  id: string;
  case_id: string;
  violation_type: string | null;
  cited_articles: string[];
  penalty_amount: number | null;
  defense_deadline: string | null;
  hearing_eligible: boolean;
  procedure_issues: string[];
  defensibility: Defensibility | null;
  defensibility_reason: string | null;
  questions: Question[] | null;
  answers: Record<string, string> | null;
}

export interface Question {
  key: string;
  text: string;
  type: 'boolean' | 'text' | 'date' | 'choice';
  options?: string[];
  why: string;
  required: boolean;
}

export interface ActivationCode {
  id: string;
  code: string;
  max_uses: number;
  used_count: number;
  memo: string | null;
  is_active: boolean;
  created_at: string;
  last_used_at: string | null;
}

export interface Document {
  id: string;
  case_id: string;
  statement_md: string | null;
  statement_pdf_path: string | null;
  evidence_checklist_md: string | null;
  hearing_application_md: string | null;
  version: number;
  supplement_text: string | null;
  created_at: string;
  // Complaint-specific document fields
  response_letter_md: string | null;
  negotiation_script_md: string | null;
  risk_warning_md: string | null;
}

// ===== Complaint Module Types =====

export interface ConsumerClaim {
  description: string;
  legal_basis: string;
  validity: 'valid' | 'partial' | 'invalid';
  validity_reason: string;
}

export interface EstimatedCost {
  cooperation_cost: string;
  escalation_cost: string;
  comparison_note: string;
}

export interface ComplaintAnalysis {
  id: string;
  case_id: string;
  // Shared fields (reuse Analysis shape)
  violation_type: string | null;
  cited_articles: string[];
  questions: Question[] | null;
  answers: Record<string, string> | null;
  // Complaint-specific fields
  complaint_type: ComplaintType | null;
  complaint_source: ComplaintSource | null;
  complaint_summary: string | null;
  escalation_risk: EscalationRisk | null;
  escalation_risk_reason: string | null;
  recommended_strategy: RecommendedStrategy | null;
  strategy_explanation: string | null;
  consumer_claims: ConsumerClaim[] | null;
  estimated_cost: EstimatedCost | null;
  response_deadline_days: number | null;
}

export interface CaseListItem {
  id: string;
  case_type: CaseType;
  status: CaseStatus;
  created_at: string;
  // Analysis summary (joined)
  violation_type: string | null;
  complaint_type: string | null;
  complaint_summary: string | null;
  penalty_amount: number | null;
  defensibility: Defensibility | null;
  escalation_risk: EscalationRisk | null;
}

export interface ComplaintDocuments {
  id: string;
  case_id: string;
  response_letter_md: string | null;
  negotiation_script_md: string | null;
  risk_warning_md: string | null;
  statement_pdf_path: string | null;
  version: number;
  created_at: string;
}
