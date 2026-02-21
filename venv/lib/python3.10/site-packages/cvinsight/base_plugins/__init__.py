"""Base plugins package for CVInsight."""
from .base import BasePlugin
from .profile_extractor import ProfileExtractorPlugin
from .skills_extractor import SkillsExtractorPlugin
from .education_extractor import EducationExtractorPlugin
from .experience_extractor import ExperienceExtractorPlugin
from .yoe_extractor import YoeExtractorPlugin

__all__ = [
    'BasePlugin',
    'ProfileExtractorPlugin',
    'SkillsExtractorPlugin',
    'EducationExtractorPlugin',
    'ExperienceExtractorPlugin',
    'YoeExtractorPlugin'
]