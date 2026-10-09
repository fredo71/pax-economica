using Microsoft.AspNetCore.StaticFiles;

var builder = WebApplication.CreateBuilder(args);
var app = builder.Build();

// static files answer 404 for any extension missing from the built-in list, and .geojson is missing
var contentTypes = new FileExtensionContentTypeProvider();
contentTypes.Mappings[".geojson"] = "application/geo+json";

app.UseDefaultFiles();
app.UseStaticFiles(new StaticFileOptions { ContentTypeProvider = contentTypes });

app.Run();
