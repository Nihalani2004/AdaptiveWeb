from pydantic import BaseModel
from typing import Optional, Dict, Any, List

class AnalyticsEvent(BaseModel):
    eventType: str # "scroll", "hover", "click", "skim", "scroll_back"
    domain: str
    metadata: Optional[Dict[str, Any]] = None
    timestamp: str

class SummarizeRequest(BaseModel):
    text: str

class SimplifyRequest(BaseModel):
    text: str

class RelatedRequest(BaseModel):
    url: str
    keywords: Optional[List[str]] = None
