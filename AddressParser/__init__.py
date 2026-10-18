"""Офлайн-разбор адресов доставки."""
from .parser import AddressParser, parse_address, explain_address, parse_records

__all__ = ['AddressParser', 'parse_address', 'explain_address', 'parse_records']
