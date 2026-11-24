/** Matches the rhythm of user bubbles and assistant paragraphs while history loads. */
export const ChatSkeleton = () => (
  <div aria-busy="true" aria-label="Загрузка переписки" className="ai-skeleton" role="status">
    <div aria-hidden="true">
      <div className="ai-msg ai-user">
        <div className="ai-bubble ai-skeleton-question">
          <span className="ai-skeleton-line" />
          <span className="ai-skeleton-line" />
        </div>
      </div>
      <div className="ai-msg ai-skeleton-answer">
        <span className="ai-skeleton-line ai-skeleton-summary" />
        <div className="ai-skeleton-paragraph">
          <span className="ai-skeleton-line" />
          <span className="ai-skeleton-line" />
          <span className="ai-skeleton-line" />
          <span className="ai-skeleton-line" />
        </div>
        <div className="ai-skeleton-paragraph">
          <span className="ai-skeleton-line" />
          <span className="ai-skeleton-line" />
          <span className="ai-skeleton-line" />
        </div>
      </div>
      <div className="ai-msg ai-user">
        <div className="ai-bubble ai-skeleton-question ai-skeleton-short">
          <span className="ai-skeleton-line" />
        </div>
      </div>
      <div className="ai-skeleton-paragraph">
        <span className="ai-skeleton-line" />
        <span className="ai-skeleton-line" />
        <span className="ai-skeleton-line" />
      </div>
    </div>
  </div>
);
