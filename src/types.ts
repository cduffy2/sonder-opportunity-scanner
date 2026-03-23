export interface Opportunity {
  funder_name: string;
  opportunity_title: string;
  type: string;
  deadline: string;
  amount: string;
  link: string;
  geographic_focus: string;
  sectors: string[];
  win_probability: 'High' | 'Medium' | 'Low';
  win_rationale: string;
  fit_rationale: string;
  next_steps: string;
  posted_date: string;
}
