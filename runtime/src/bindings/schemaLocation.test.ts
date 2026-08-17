import { describe, expect, it } from 'vitest';
import { schemaDetail, schemaLocationForm } from './schemaLocation';

describe('schemaLocationForm', () => {
  it('classifies each form, trimming surrounding whitespace', () => {
    expect(schemaLocationForm('  self ')).toBe('self');
    expect(schemaLocationForm('id:42')).toBe('id');
    expect(schemaLocationForm('https://api.example.com/openapi.json')).toBe('url');
    expect(schemaLocationForm('http://localhost:3000/openapi.json')).toBe('url');
    expect(schemaLocationForm('file:./openapi.yaml')).toBe('file');
    expect(schemaLocationForm('openapi.yaml')).toBe('file');
  });
});

describe('schemaDetail', () => {
  it('strips the form prefix, leaving the editable detail', () => {
    expect(schemaDetail('self')).toBe('');
    expect(schemaDetail('id: 42 ')).toBe('42');
    expect(schemaDetail('file:./sub/openapi.yaml')).toBe('./sub/openapi.yaml');
    expect(schemaDetail('https://api.example.com/openapi.json')).toBe(
      'https://api.example.com/openapi.json',
    );
  });
});
