#!/usr/bin/env python3
"""
Comprehensive script to replace all train_id references with rake_serial_number
"""
import re
import sys

def replace_all_train_id(content):
    """Replace all train_id references with rake_serial_number"""
    
    # Pattern 1: WHERE (train_id = $X OR rake_serial_number = $X) -> WHERE rake_serial_number = $X
    content = re.sub(
        r'WHERE\s+\(train_id\s*=\s*\$(\d+)\s+OR\s+rake_serial_number\s*=\s*\$\1\)',
        r'WHERE rake_serial_number = $\1',
        content,
        flags=re.IGNORECASE | re.MULTILINE
    )
    
    # Pattern 2: WHERE train_id = $X OR rake_serial_number = $X -> WHERE rake_serial_number = $X
    content = re.sub(
        r'WHERE\s+train_id\s*=\s*\$(\d+)\s+OR\s+rake_serial_number\s*=\s*\$\1',
        r'WHERE rake_serial_number = $\1',
        content,
        flags=re.IGNORECASE | re.MULTILINE
    )
    
    # Pattern 3: WHERE train_id = $X (standalone) -> WHERE rake_serial_number = $X
    content = re.sub(
        r'WHERE\s+train_id\s*=\s*\$(\d+)',
        r'WHERE rake_serial_number = $\1',
        content,
        flags=re.IGNORECASE | re.MULTILINE
    )
    
    # Pattern 4: JOIN conditions (w.train_id = d.train_id OR w.rake_serial_number = d.rake_serial_number)
    content = re.sub(
        r'\(w\.train_id\s*=\s*d\.train_id\s+OR\s+w\.rake_serial_number\s*=\s*d\.rake_serial_number\)',
        r'w.rake_serial_number = d.rake_serial_number',
        content,
        flags=re.IGNORECASE
    )
    
    content = re.sub(
        r'\(a\.train_id\s*=\s*d\.train_id\s+OR\s+a\.rake_serial_number\s*=\s*d\.rake_serial_number\)',
        r'a.rake_serial_number = d.rake_serial_number',
        content,
        flags=re.IGNORECASE
    )
    
    # Pattern 5: INSERT INTO table (train_id, ...) -> remove train_id from column list
    # This needs careful handling - remove train_id, from column lists
    content = re.sub(
        r'INSERT INTO (\w+)\s*\(\s*train_id\s*,\s*',
        r'INSERT INTO \1 (',
        content,
        flags=re.IGNORECASE
    )
    content = re.sub(
        r'INSERT INTO (\w+)\s*\(\s*([^)]*?),\s*train_id\s*,\s*',
        r'INSERT INTO \1 (\2, ',
        content,
        flags=re.IGNORECASE
    )
    content = re.sub(
        r'INSERT INTO (\w+)\s*\(\s*([^)]*?),\s*train_id\s*\)',
        r'INSERT INTO \1 (\2)',
        content,
        flags=re.IGNORECASE
    )
    
    # Pattern 6: VALUES ($1, $2, train_id_value, ...) -> remove train_id value
    # This is complex and needs context, so we'll handle it case by case
    
    # Pattern 7: UPDATE table SET train_id = ... -> remove
    content = re.sub(
        r',\s*train_id\s*=\s*\$(\d+)',
        r'',
        content,
        flags=re.IGNORECASE
    )
    content = re.sub(
        r'SET\s+train_id\s*=\s*\$(\d+)\s*,',
        r'SET ',
        content,
        flags=re.IGNORECASE
    )
    
    # Pattern 8: SELECT train_id, ... -> SELECT rake_serial_number AS train_id, ... (for backward compat)
    content = re.sub(
        r'SELECT\s+train_id\s*,',
        r'SELECT rake_serial_number AS train_id,',
        content,
        flags=re.IGNORECASE
    )
    
    # Pattern 9: Replace actualTrainId variable references with rakeSerialNumber
    content = re.sub(
        r'\bactualTrainId\b',
        r'rakeSerialNumber',
        content
    )
    
    content = re.sub(
        r'\bactualRakeSerialNumber\b',
        r'rakeSerialNumber',
        content
    )
    
    # Pattern 10: Replace train_id column references in queries
    content = re.sub(
        r'\bd\.train_id\b',
        r'd.rake_serial_number',
        content
    )
    content = re.sub(
        r'\bw\.train_id\b',
        r'w.rake_serial_number',
        content
    )
    content = re.sub(
        r'\ba\.train_id\b',
        r'a.rake_serial_number',
        content
    )
    content = re.sub(
        r'\bd2\.train_id\b',
        r'd2.rake_serial_number',
        content
    )
    
    return content

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python3 replace_all_train_id.py <input_file>")
        sys.exit(1)
    
    input_file = sys.argv[1]
    
    with open(input_file, 'r') as f:
        content = f.read()
    
    new_content = replace_all_train_id(content)
    
    # Write backup first
    with open(input_file + '.backup', 'w') as f:
        f.write(content)
    
    # Write new content
    with open(input_file, 'w') as f:
        f.write(new_content)
    
    print(f"Processed {input_file}")
    print(f"Backup saved to {input_file}.backup")
