// Utility functions for exporting data to CSV

export function exportToCSV(data: any[], filename: string) {
  if (!data || data.length === 0) {
    console.warn('No data to export');
    return;
  }

  // Get headers from first object
  const headers = Object.keys(data[0]);
  
  // Create CSV content
  const csvContent = [
    headers.join(','), // Header row
    ...data.map(row => 
      headers.map(header => {
        const value = row[header];
        // Escape commas and quotes
        if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      }).join(',')
    )
  ].join('\n');

  // Create blob and download
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}_${new Date().toISOString().split('T')[0]}.csv`);
  link.style.visibility = 'hidden';
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function exportLeadsToCSV(leads: any[]) {
  const exportData = leads.map(lead => ({
    'Företag': lead.companyName,
    'Kontaktperson': lead.contactName,
    'E-post': lead.email,
    'Telefon': lead.phone,
    'Status': lead.status === 'new' ? 'Ny' : 
              lead.status === 'contacted' ? 'Kontaktad' : 
              lead.status === 'qualified' ? 'Kvalificerad' : 'Förlorad',
    'AI-Score': lead.aiScore === 'high' ? 'HÖG' : 
                lead.aiScore === 'medium' ? 'MEDEL' : 'LÅG',
    'Budget': lead.budget || '-',
    'Tidsplan': lead.timeline,
    'Beskrivning': lead.description,
    'Datum': new Date(lead.timestamp).toLocaleDateString('sv-SE')
  }));
  
  exportToCSV(exportData, 'forfragningar');
}

export function exportTrainingsToCSV(trainings: any[]) {
  const exportData = trainings.map(training => ({
    'Titel': training.title,
    'Kategori': training.categoryId,
    'Format': training.format === 'online' ? 'Online' : 
              training.format === 'onsite' ? 'På plats' : 'Hybrid',
    'Längd': training.duration,
    'Visningar': training.views,
    'Förfrågningar': training.leads,
    'Konvertering': `${Math.round((training.leads / training.views) * 100)}%`,
    'Utvald': training.featured ? 'Ja' : 'Nej'
  }));
  
  exportToCSV(exportData, 'utbildningar');
}

export function exportAnalyticsToCSV(trainings: any[]) {
  const exportData = trainings.map(training => ({
    'Utbildning': training.title,
    'Visningar': training.views,
    'Förfrågningar': training.leads,
    'Konverteringsgrad': `${Math.round((training.leads / training.views) * 100)}%`,
    'Format': training.format === 'online' ? 'Online' : 
              training.format === 'onsite' ? 'På plats' : 'Hybrid',
    'Längd': training.duration
  }));
  
  exportToCSV(exportData, 'analys');
}
