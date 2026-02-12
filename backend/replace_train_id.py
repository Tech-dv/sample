#!/usr/bin/env python3
"""
Script to replace train_id with rake_serial_number in backend/index.js
"""
import re
import sys

def replace_train_id(content):
    """Replace train_id references with rake_serial_number"""
    
    # Replace WHERE clauses: (train_id = $X OR rake_serial_number = $X) -> rake_serial_number = $X
    content = re.sub(
        r'WHERE\s+\(train_id\s*=\s*\$(\d+)\s+OR\s+rake_serial_number\s*=\s*\$\1\)',
        r'WHERE rake_serial_number = $\1',
        content,
        flags=re.IGNORECASE
    )
    
    # Replace WHERE clauses: train_id = $X OR rake_serial_number = $X -> rake_serial_number = $X
    content = re.sub(
        r'WHERE\s+train_id\s*=\s*\$(\d+)\s+OR\s+rake_serial_number\s*=\s*\$\1',
        r'WHERE rake_serial_number = $\1',
        content,
        flags=re.IGNORECASE
    )
    
    # Replace JOIN conditions: (w.train_id = d.train_id OR w.rake_serial_number = d.rake_serial_number) -> w.rake_serial_number = d.rake_serial_number
    content = re.sub(
        r'\(w\.train_id\s*=\s*d\.train_id\s+OR\s+w\.rake_serial_number\s*=\s*d\.rake_serial_number\)',
        r'w.rake_serial_number = d.rake_serial_number',
        content,
        flags=re.IGNORECASE
    )
    
    # Replace JOIN conditions: (a.train_id = d.train_id OR a.rake_serial_number = d.rake_serial_number) -> a.rake_serial_number = d.rake_serial_number
    content = re.sub(
        r'\(a\.train_id\s*=\s*d\.train_id\s+OR\s+a\.rake_serial_number\s*=\s*d\.rake_serial_number\)',
        r'a.rake_serial_number = d.rake_serial_number',
        content,
        flags=re.IGNORECASE
    )
    
    # Replace WHERE train_id = $X (standalone) -> WHERE rake_serial_number = $X
    content = re.sub(
        r'WHERE\s+train_id\s*=\s*\$(\d+)',
        r'WHERE rake_serial_number = $\1',
        content,
        flags=re.IGNORECASE
    )
    
    # Replace INSERT INTO ... (train_id, ...) -> remove train_id from column list
    # This is more complex, need to handle carefully
    
    # Replace SELECT train_id -> SELECT rake_serial_number AS train_id (for backward compat in responses)
    content = re.sub(
        r'SELECT\s+train_id\s*,',
        r'SELECT rake_serial_number AS train_id,',
        content,
        flags=re.IGNORECASE
    )
    
    return content

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python3 replace_train_id.py <input_file> [output_file]")
        sys.exit(1)
    
    input_file = sys.argv[1]
    output_file = sys.argv[2] if len(sys.argv) > 2 else input_file + '.new'
    
    with open(input_file, 'r') as f:
        content = f.read()
    
    new_content = replace_train_id(content)
    
    with open(output_file, 'w') as f:
        f.write(new_content)
    
    print(f"Processed {input_file}")
    print(f"Output written to {output_file}")
