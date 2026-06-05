interface FeedbackSurveyProps {
  onDismiss: () => void;
}

export function FeedbackSurvey(_props: FeedbackSurveyProps) {
  return null;
}

export function shouldShowSurvey(_feedbackSurveyRate: number): boolean {
  return false;
}
