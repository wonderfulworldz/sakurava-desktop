# Filter bar performer

Code: No
Layout: Yes
Mockup: Yes
Parent item: Final Collection Spec (Final%20Collection%20Spec%20370b4fe015dd804aa077cf922c46f1bd.md)
Select: In progress

## 1. Toolbar

- **Search Performers** - Search field - Cari performer berdasarkan name, original name, alias, nationality, category/tag.
- **Filters** - Button + count badge - Membuka filter panel dan menampilkan jumlah filter aktif.
- **Sort** - Dropdown - Mengurutkan hasil performer.
- **View** - Single icon button - Switch Card / Table.

Format:

```
[Search performers, name, alias, code, tag...] [Filters 0] [Sort: A-Z] [View]
```

## 2. Filter Panel

### Status

- Active/Retired/Unknow

### Basic Info

- Gender - Male/Female/Other.
- **Age** - Range select - Filter usia.
- **Nationality** - Searchable select - Filter berdasarkan negara/region.

### Physical

- Body Height - Short(<155cm)/Medium/Tall(>165cm).
- Body Type - Slim / Averange / Curvy / Plus Size
    - 
    
    if (waist < 64) return "Slim";
    if (waist >= 64 && waist <= 74) return "Average";
    if (waist > 74 && waist <= 85) return "Curvy";
    return "Plus Size";
    
- Cup Size - A/B/C/D/E/F/G/H/I/J

### Career

- **Debut Year** - Date range - Filter berdasarkan tahun debut.

### Works

- **Filmography Count** - Segmented control - Few / Some / Many / All.
- **Pictorials Count** - Segmented control - Few / Some / Many / All.

### Rating

- **Rating** - Range slider - Filter average rating.

### Category

- **Tags / Attributes** - Smart category picker - Cari parent-child category/tag performer.